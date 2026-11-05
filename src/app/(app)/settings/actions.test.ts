import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
    default: {
        apiKey: { create: vi.fn(), updateMany: vi.fn() },
        organization: { update: vi.fn() },
    },
}));

import { clerkClient } from "@clerk/nextjs/server";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { createApiKey, revokeApiKey, updateOrganization } from "./actions";

function signedInAs(role: "ADMIN" | "USER") {
    vi.mocked(getCurrentUser).mockResolvedValue({
        state: "ready",
        user: { id: "user1" },
        organization: { id: "org1", clerkOrgId: "clerk_org1", name: "Acme" },
        role,
    } as never);
}

function form(values: Record<string, string>) {
    const formData = new FormData();
    for (const [key, value] of Object.entries(values)) formData.set(key, value);
    return formData;
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.apiKey.create).mockResolvedValue({} as never);
    vi.mocked(prisma.apiKey.updateMany).mockResolvedValue({ count: 1 } as never);
});

describe("createApiKey", () => {
    it("stores the hash for the admin's organization and returns the full key once", async () => {
        signedInAs("ADMIN");
        const state = await createApiKey({}, form({ name: " Claude desktop " }));

        expect(state.key).toMatch(/^pr_[A-Za-z0-9_-]{43}$/);
        expect(state.name).toBe("Claude desktop");
        expect(prisma.apiKey.create).toHaveBeenCalledWith({
            data: {
                name: "Claude desktop",
                canChangeStatus: false,
                prefix: state.key?.slice(3, 11),
                keyHash: expect.stringMatching(/^[0-9a-f]{64}$/),
                createdById: "user1",
                organizationId: "org1",
            },
        });
    });

    it("stores the status permission when the checkbox is ticked", async () => {
        signedInAs("ADMIN");
        await createApiKey({}, form({ name: "Rentals bot", canChangeStatus: "on" }));

        expect(vi.mocked(prisma.apiKey.create).mock.calls[0][0].data).toMatchObject({
            name: "Rentals bot",
            canChangeStatus: true,
        });
    });

    it("refuses users who aren't admins", async () => {
        signedInAs("USER");
        await expect(createApiKey({}, form({ name: "Claude" }))).rejects.toThrow("Not authorized");
        expect(prisma.apiKey.create).not.toHaveBeenCalled();
    });

    it("refuses signed-out users and users without an organization", async () => {
        for (const result of [{ state: "signed-out" }, { state: "needs-org", clerkUserId: "clerk1" }]) {
            vi.mocked(getCurrentUser).mockResolvedValue(result as never);
            await expect(createApiKey({}, form({ name: "Claude" }))).rejects.toThrow("Not authorized");
        }
        expect(prisma.apiKey.create).not.toHaveBeenCalled();
    });

    it("returns field errors for a blank name", async () => {
        signedInAs("ADMIN");
        const state = await createApiKey({}, form({ name: "  " }));
        expect(state.errors?.name).toBeDefined();
        expect(state.key).toBeUndefined();
        expect(prisma.apiKey.create).not.toHaveBeenCalled();
    });
});

describe("updateOrganization", () => {
    it("refuses users who aren't admins", async () => {
        signedInAs("USER");
        await expect(updateOrganization({}, form({ name: "Acme Rentals" }))).rejects.toThrow("Not authorized");
        expect(prisma.organization.update).not.toHaveBeenCalled();
    });

    it("saves the details for an admin and renames the Clerk organization", async () => {
        signedInAs("ADMIN");
        const updateClerkOrganization = vi.fn().mockResolvedValue({});
        vi.mocked(clerkClient).mockResolvedValue({
            organizations: { updateOrganization: updateClerkOrganization },
        } as never);
        vi.mocked(prisma.organization.update).mockResolvedValue({} as never);

        const state = await updateOrganization({}, form({ name: "Acme Rentals", phone: "", email: "" }));

        expect(state).toEqual({ ok: true });
        expect(updateClerkOrganization).toHaveBeenCalledWith("clerk_org1", { name: "Acme Rentals" });
        expect(prisma.organization.update).toHaveBeenCalledWith({
            where: { id: "org1" },
            data: expect.objectContaining({ name: "Acme Rentals" }),
        });
    });
});

describe("revokeApiKey", () => {
    it("revokes only an unrevoked key in the admin's organization", async () => {
        signedInAs("ADMIN");
        await revokeApiKey(form({ id: "key1" }));
        expect(prisma.apiKey.updateMany).toHaveBeenCalledWith({
            where: { id: "key1", organizationId: "org1", revokedAt: null },
            data: { revokedAt: expect.any(Date) },
        });
    });

    it("refuses users who aren't admins", async () => {
        signedInAs("USER");
        await expect(revokeApiKey(form({ id: "key1" }))).rejects.toThrow("Not authorized");
        expect(prisma.apiKey.updateMany).not.toHaveBeenCalled();
    });

    it("rejects a missing id", async () => {
        signedInAs("ADMIN");
        await expect(revokeApiKey(form({}))).rejects.toThrow("Invalid API key");
        expect(prisma.apiKey.updateMany).not.toHaveBeenCalled();
    });
});
