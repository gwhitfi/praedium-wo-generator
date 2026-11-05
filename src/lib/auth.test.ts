import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(), currentUser: vi.fn(), clerkClient: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
    default: {
        organization: { findUnique: vi.fn(), create: vi.fn(), findUniqueOrThrow: vi.fn() },
        user: { findUnique: vi.fn(), create: vi.fn(), findUniqueOrThrow: vi.fn() },
        membership: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    },
}));

import { auth, currentUser } from "@clerk/nextjs/server";
import { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "./auth";

const organization = { id: "org1", clerkOrgId: "clerk_org1", name: "Acme" };
const user = { id: "user1", clerkId: "clerk_user1", email: "sam@example.com" };

function signedIn(orgRole: string | null = "org:member", orgId: string | null = "clerk_org1") {
    vi.mocked(auth).mockResolvedValue({ userId: "clerk_user1", orgId, orgRole } as never);
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.organization.findUnique).mockResolvedValue(organization as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(user as never);
    vi.mocked(prisma.membership.findUnique).mockResolvedValue({ id: "m1", role: "USER" } as never);
});

describe("getCurrentUser", () => {
    it("returns signed-out without a Clerk user", async () => {
        vi.mocked(auth).mockResolvedValue({ userId: null, orgId: null, orgRole: null } as never);
        expect(await getCurrentUser()).toEqual({ state: "signed-out" });
    });

    it("returns needs-org without an active organization", async () => {
        signedIn("org:member", null);
        expect(await getCurrentUser()).toEqual({ state: "needs-org", clerkUserId: "clerk_user1" });
        expect(prisma.organization.findUnique).not.toHaveBeenCalled();
    });

    it("gives ADMIN to an org:admin", async () => {
        signedIn("org:admin");
        vi.mocked(prisma.membership.findUnique).mockResolvedValue({ id: "m1", role: "ADMIN" } as never);
        expect(await getCurrentUser()).toEqual({ state: "ready", user, organization, role: "ADMIN" });
    });

    it("gives USER to an org:member", async () => {
        signedIn("org:member");
        expect(await getCurrentUser()).toMatchObject({ state: "ready", role: "USER" });
    });

    it("gives USER when Clerk reports no role or a custom one", async () => {
        signedIn(null);
        expect(await getCurrentUser()).toMatchObject({ state: "ready", role: "USER" });
        signedIn("org:billing");
        expect(await getCurrentUser()).toMatchObject({ state: "ready", role: "USER" });
    });

    it("ignores a membership created by a concurrent request, but not other errors", async () => {
        signedIn("org:member");
        vi.mocked(prisma.membership.findUnique).mockResolvedValue(null);
        const duplicate = new Prisma.PrismaClientKnownRequestError("exists", { code: "P2002", clientVersion: "7" });
        vi.mocked(prisma.membership.create).mockRejectedValueOnce(duplicate);
        expect(await getCurrentUser()).toMatchObject({ state: "ready", role: "USER" });

        vi.mocked(prisma.membership.create).mockRejectedValueOnce(new Error("connection lost"));
        await expect(getCurrentUser()).rejects.toThrow("connection lost");
    });

    it("creates the membership when it's missing", async () => {
        signedIn("org:admin");
        vi.mocked(prisma.membership.findUnique).mockResolvedValue(null);
        await getCurrentUser();
        expect(prisma.membership.findUnique).toHaveBeenCalledWith({
            where: { userId_organizationId: { userId: "user1", organizationId: "org1" } },
        });
        expect(prisma.membership.create).toHaveBeenCalledWith({
            data: { userId: "user1", organizationId: "org1", role: "ADMIN" },
        });
    });

    it("updates the membership role when Clerk's role changed", async () => {
        signedIn("org:admin");
        await getCurrentUser();
        expect(prisma.membership.update).toHaveBeenCalledWith({ where: { id: "m1" }, data: { role: "ADMIN" } });
        expect(prisma.membership.create).not.toHaveBeenCalled();
    });

    it("doesn't write the membership when it already matches", async () => {
        signedIn("org:member");
        await getCurrentUser();
        expect(prisma.membership.create).not.toHaveBeenCalled();
        expect(prisma.membership.update).not.toHaveBeenCalled();
    });

    it("creates a new user whose email an older user row already has", async () => {
        signedIn("org:member");
        // The old row (another clerkId, same email) isn't found by clerkId, so a new row is created.
        vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
        vi.mocked(currentUser).mockResolvedValue({
            emailAddresses: [{ emailAddress: "sam@example.com" }],
            firstName: "Sam",
            lastName: null,
        } as never);
        const created = { id: "user2", clerkId: "clerk_user1", email: "sam@example.com" };
        vi.mocked(prisma.user.create).mockResolvedValue(created as never);
        vi.mocked(prisma.membership.findUnique).mockResolvedValue(null);

        expect(await getCurrentUser()).toEqual({ state: "ready", user: created, organization, role: "USER" });
        expect(prisma.user.create).toHaveBeenCalledWith({
            data: {
                clerkId: "clerk_user1",
                email: "sam@example.com",
                firstName: "Sam",
                lastName: null,
                organizationId: "org1",
            },
        });
        expect(prisma.user.findUniqueOrThrow).not.toHaveBeenCalled();
        expect(prisma.membership.create).toHaveBeenCalledWith({
            data: { userId: "user2", organizationId: "org1", role: "USER" },
        });
    });
});
