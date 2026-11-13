import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/deletion", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/deletion")>()),
    deleteAccount: vi.fn(),
    deleteOrganizationEverywhere: vi.fn(),
    planAccountDeletion: vi.fn(),
}));
vi.mock("@/lib/purgeOrganization", () => ({ purgeOrganization: vi.fn() }));
vi.mock("@/lib/email", () => ({ getAppUrl: () => "https://praedium.test" }));
vi.mock("@/lib/emailLog", () => ({ sendLoggedEmail: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
    default: {
        apiKey: { create: vi.fn(), updateMany: vi.fn() },
        organization: { update: vi.fn(), updateMany: vi.fn() },
        user: { update: vi.fn() },
    },
}));

import { clerkClient } from "@clerk/nextjs/server";
import { after } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { deleteAccount, deleteOrganizationEverywhere, planAccountDeletion } from "@/lib/deletion";
import { sendLoggedEmail } from "@/lib/emailLog";
import { purgeOrganization } from "@/lib/purgeOrganization";
import {
    createApiKey,
    deleteMyAccount,
    deleteOrganization,
    previewAccountDeletion,
    revokeApiKey,
    setNotificationPreferences,
    updateOrganization,
} from "./actions";

function signedInAs(role: "ADMIN" | "USER") {
    vi.mocked(getCurrentUser).mockResolvedValue({
        state: "ready",
        user: { id: "user1", clerkId: "clerk_user1", firstName: "Dana", lastName: "Reyes", email: "dana@acme.test" },
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

describe("setNotificationPreferences", () => {
    function checked(...types: string[]) {
        const formData = new FormData();
        for (const type of types) formData.append("types", type);
        return formData;
    }

    it("saves the ticked options on the signed-in user, for any role", async () => {
        signedInAs("USER");
        expect(await setNotificationPreferences({}, checked("overdue", "created"))).toEqual({ ok: true });
        expect(prisma.user.update).toHaveBeenCalledWith({
            where: { id: "user1" },
            data: { notificationTypes: ["overdue", "created"] },
        });
    });

    it("saves the all-off marker when nothing is ticked", async () => {
        signedInAs("USER");
        await setNotificationPreferences({}, checked());
        expect(prisma.user.update).toHaveBeenCalledWith({
            where: { id: "user1" },
            data: { notificationTypes: ["none"] },
        });
    });

    it("refuses unknown options without saving", async () => {
        signedInAs("USER");
        const state = await setNotificationPreferences({}, checked("completed", "everything"));
        expect(state.error).toBeDefined();
        expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("requires a signed-in user", async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({ state: "signed-out" });
        await expect(setNotificationPreferences({}, checked("completed"))).rejects.toThrow("Not authorized");
        expect(prisma.user.update).not.toHaveBeenCalled();
    });
});

describe("deleteOrganization", () => {
    const deleteClerkOrganization = vi.fn();
    const getUser = vi.fn();
    const getOrganizationMembershipList = vi.fn();

    // Runs what the action left for after the response.
    async function runAfter() {
        for (const [task] of vi.mocked(after).mock.calls) await (task as () => Promise<void>)();
    }

    beforeEach(() => {
        vi.spyOn(console, "info").mockImplementation(() => {});
        vi.mocked(prisma.organization.updateMany).mockResolvedValue({ count: 1 } as never);
        getOrganizationMembershipList.mockResolvedValue({
            data: [
                { role: "org:admin", publicUserData: { userId: "clerk_user1" } },
                { role: "org:admin", publicUserData: { userId: "clerk_user2" } },
            ],
            totalCount: 2,
        });
        getUser.mockImplementation(async (id: string) => ({
            primaryEmailAddress: { emailAddress: id === "clerk_user1" ? "dana@acme.test" : "sam@acme.test" },
        }));
        vi.mocked(clerkClient).mockResolvedValue({
            organizations: { deleteOrganization: deleteClerkOrganization, getOrganizationMembershipList },
            users: { getUser },
        } as never);
    });

    it("locks the admin's own organization once its name is typed, ignoring case and spaces", async () => {
        signedInAs("ADMIN");

        expect(await deleteOrganization("  acme ")).toEqual({ ok: true });
        expect(prisma.organization.updateMany).toHaveBeenCalledWith({
            where: { id: "org1", deletedAt: null },
            data: { deletedAt: expect.any(Date) },
        });
        expect(console.info).toHaveBeenCalledWith(expect.stringMatching(/org1.*user1/));
    });

    it("deletes nothing: no Clerk delete, no purge, no API key revocation", async () => {
        signedInAs("ADMIN");

        await deleteOrganization("Acme");
        await runAfter();

        expect(deleteClerkOrganization).not.toHaveBeenCalled();
        expect(deleteOrganizationEverywhere).not.toHaveBeenCalled();
        expect(purgeOrganization).not.toHaveBeenCalled();
        expect(prisma.apiKey.updateMany).not.toHaveBeenCalled();
    });

    it("emails every admin from Clerk after the response, including the one who deleted it", async () => {
        signedInAs("ADMIN");

        await deleteOrganization("Acme");
        expect(sendLoggedEmail).not.toHaveBeenCalled();
        await runAfter();

        expect(getOrganizationMembershipList).toHaveBeenCalledWith(
            expect.objectContaining({ organizationId: "clerk_org1", role: ["org:admin"] }),
        );
        expect(vi.mocked(sendLoggedEmail).mock.calls.map(([email]) => email.to)).toEqual([
            "dana@acme.test",
            "sam@acme.test",
        ]);
        expect(sendLoggedEmail).toHaveBeenCalledWith(
            expect.objectContaining({
                organizationId: "org1",
                kind: "ORGANIZATION_DELETED",
                subject: expect.stringContaining("Acme will be deleted on"),
                text: expect.stringContaining("Dana R. deleted Acme"),
            }),
        );
    });

    it("still succeeds when the emails fail", async () => {
        signedInAs("ADMIN");
        vi.spyOn(console, "error").mockImplementation(() => {});
        vi.mocked(sendLoggedEmail).mockRejectedValueOnce(new Error("Resend is down"));

        expect(await deleteOrganization("Acme")).toEqual({ ok: true });
        await runAfter();
        // The second admin is still emailed.
        expect(sendLoggedEmail).toHaveBeenCalledTimes(2);

        vi.mocked(after).mockClear();
        getOrganizationMembershipList.mockRejectedValue(new Error("Clerk is down"));
        expect(await deleteOrganization("Acme")).toEqual({ ok: true });
        await expect(runAfter()).resolves.toBeUndefined();
    });

    it("doesn't email again when the organization was already locked", async () => {
        signedInAs("ADMIN");
        vi.mocked(prisma.organization.updateMany).mockResolvedValue({ count: 0 } as never);

        expect(await deleteOrganization("Acme")).toEqual({ ok: true });
        expect(after).not.toHaveBeenCalled();
    });

    it("refuses a wrong or empty name without locking anything", async () => {
        signedInAs("ADMIN");

        expect(await deleteOrganization("Acme Rentals")).toEqual({ ok: false, error: 'Type "Acme" to confirm.' });
        expect(await deleteOrganization("   ")).toEqual({ ok: false, error: 'Type "Acme" to confirm.' });
        expect(prisma.organization.updateMany).not.toHaveBeenCalled();
        expect(after).not.toHaveBeenCalled();
    });

    it("refuses anyone but an admin", async () => {
        signedInAs("USER");

        expect(await deleteOrganization("Acme")).toEqual({
            ok: false,
            error: "Only admins can delete the organization.",
        });
        expect(prisma.organization.updateMany).not.toHaveBeenCalled();
        expect(after).not.toHaveBeenCalled();
    });

    it("explains a failure instead of throwing", async () => {
        signedInAs("ADMIN");
        vi.spyOn(console, "error").mockImplementation(() => {});
        vi.mocked(prisma.organization.updateMany).mockRejectedValue(new Error("database hiccup"));

        expect(await deleteOrganization("Acme")).toEqual({
            ok: false,
            error: "Couldn't delete the organization. Try again.",
        });
        expect(after).not.toHaveBeenCalled();
    });
});

describe("deleteMyAccount", () => {
    it("deletes the signed-in user's own account once confirmed", async () => {
        signedInAs("USER");
        vi.mocked(clerkClient).mockResolvedValue("clerk" as never);
        vi.mocked(deleteAccount).mockResolvedValue({ ok: true });

        expect(await deleteMyAccount("yes")).toEqual({ ok: true });
        expect(deleteAccount).toHaveBeenCalledWith("clerk", "clerk_user1");
    });

    it("refuses without the typed confirmation", async () => {
        signedInAs("USER");

        expect(await deleteMyAccount("sure")).toMatchObject({ ok: false });
        expect(deleteAccount).not.toHaveBeenCalled();
    });

    it("passes on a refusal, such as being the only admin", async () => {
        signedInAs("ADMIN");
        vi.mocked(deleteAccount).mockResolvedValue({ ok: false, error: "You're the only admin of Acme." });

        expect(await deleteMyAccount("yes")).toEqual({ ok: false, error: "You're the only admin of Acme." });
    });
});

describe("previewAccountDeletion", () => {
    it("lists what blocks the deletion and which organizations would go with it", async () => {
        signedInAs("USER");
        vi.mocked(planAccountDeletion).mockResolvedValue({
            blockedBy: ["Acme"],
            organizationsToDelete: [{ clerkOrgId: "clerk_solo", name: "Solo" }],
        });

        expect(await previewAccountDeletion()).toEqual({
            ok: true,
            blockedBy: ["Acme"],
            organizationsToDelete: ["Solo"],
        });
    });
});
