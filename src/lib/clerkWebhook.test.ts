import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
    default: {
        organization: { findUnique: vi.fn(), updateMany: vi.fn() },
        user: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
        membership: { deleteMany: vi.fn(), updateMany: vi.fn() },
        apiKey: { updateMany: vi.fn() },
        $transaction: vi.fn(),
    },
}));

import type { WebhookEvent } from "@clerk/nextjs/webhooks";
import prisma from "@/lib/prisma";
import { anonymizedEmail, handleClerkEvent, REVOKED_REASONS } from "./clerkWebhook";

const organization = { id: "org1", clerkOrgId: "clerk_org1" };
const user = { id: "user1", clerkId: "clerk_user1" };

// Only the fields the handlers read; the rest of Clerk's payload doesn't matter here.
function event(type: string, data: Record<string, unknown>): WebhookEvent {
    return { type, data, object: "event" } as unknown as WebhookEvent;
}

const membership = (role = "org:member") => ({
    organization: { id: "clerk_org1" },
    public_user_data: { user_id: "clerk_user1" },
    role,
});

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.organization.findUnique).mockResolvedValue(organization as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(user as never);
    vi.mocked(prisma.$transaction).mockResolvedValue([] as never);
});

describe("handleClerkEvent", () => {
    it("removes a departed member and revokes the keys they made in that organization only", async () => {
        await handleClerkEvent(event("organizationMembership.deleted", membership()));

        expect(prisma.membership.deleteMany).toHaveBeenCalledWith({
            where: { userId: "user1", organizationId: "org1" },
        });
        expect(prisma.apiKey.updateMany).toHaveBeenCalledWith({
            where: { createdById: "user1", organizationId: "org1", revokedAt: null },
            data: { revokedAt: expect.any(Date), revokedReason: REVOKED_REASONS.creatorLeft },
        });
        expect(prisma.$transaction).toHaveBeenCalledOnce();
    });

    it("ignores a membership change for an organization or user Praedium never saw", async () => {
        vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

        await handleClerkEvent(event("organizationMembership.deleted", membership()));
        await handleClerkEvent(event("organizationMembership.updated", membership("org:admin")));

        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(prisma.membership.updateMany).not.toHaveBeenCalled();
    });

    it("mirrors a role change", async () => {
        await handleClerkEvent(event("organizationMembership.updated", membership("org:admin")));
        expect(prisma.membership.updateMany).toHaveBeenCalledWith({
            where: { userId: "user1", organizationId: "org1" },
            data: { role: "ADMIN" },
        });

        await handleClerkEvent(event("organizationMembership.updated", membership("org:billing")));
        expect(prisma.membership.updateMany).toHaveBeenLastCalledWith(
            expect.objectContaining({ data: { role: "USER" } }),
        );
    });

    it("copies a new organization name, and ignores a blank one", async () => {
        await handleClerkEvent(event("organization.updated", { id: "clerk_org1", name: "  Acme Rentals " }));
        expect(prisma.organization.updateMany).toHaveBeenCalledWith({
            where: { clerkOrgId: "clerk_org1" },
            data: { name: "Acme Rentals" },
        });

        vi.mocked(prisma.organization.updateMany).mockClear();
        await handleClerkEvent(event("organization.updated", { id: "clerk_org1", name: " " }));
        expect(prisma.organization.updateMany).not.toHaveBeenCalled();
    });

    it("locks a deleted organization once and revokes all its keys", async () => {
        await handleClerkEvent(event("organization.deleted", { id: "clerk_org1", deleted: true }));

        expect(prisma.organization.updateMany).toHaveBeenCalledWith({
            where: { clerkOrgId: "clerk_org1", deletedAt: null },
            data: { deletedAt: expect.any(Date) },
        });
        expect(prisma.apiKey.updateMany).toHaveBeenCalledWith({
            where: { organization: { clerkOrgId: "clerk_org1" }, revokedAt: null },
            data: { revokedAt: expect.any(Date), revokedReason: REVOKED_REASONS.organizationDeleted },
        });
    });

    it("copies a changed name and primary email", async () => {
        await handleClerkEvent(
            event("user.updated", {
                id: "clerk_user1",
                first_name: "Samantha",
                last_name: "Lee",
                primary_email_address_id: "e2",
                email_addresses: [
                    { id: "e1", email_address: "sam@old.example.com" },
                    { id: "e2", email_address: " sam@new.example.com " },
                ],
            }),
        );

        expect(prisma.user.updateMany).toHaveBeenCalledWith({
            where: { clerkId: "clerk_user1" },
            data: { firstName: "Samantha", lastName: "Lee", email: "sam@new.example.com" },
        });
    });

    it("clears a deleted user's name and email, removes their memberships and revokes their keys", async () => {
        await handleClerkEvent(event("user.deleted", { id: "clerk_user1", deleted: true }));

        expect(prisma.apiKey.updateMany).toHaveBeenCalledWith({
            where: { createdById: "user1", revokedAt: null },
            data: { revokedAt: expect.any(Date), revokedReason: REVOKED_REASONS.creatorDeleted },
        });
        expect(prisma.membership.deleteMany).toHaveBeenCalledWith({ where: { userId: "user1" } });
        expect(prisma.user.update).toHaveBeenCalledWith({
            where: { id: "user1" },
            data: { firstName: null, lastName: null, email: anonymizedEmail("user1") },
        });
        expect(anonymizedEmail("user1")).toBe("deleted-user1@users.invalid");
    });

    it("ignores events it doesn't handle", async () => {
        await handleClerkEvent(event("session.created", { id: "sess1" }));
        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });
});
