import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
    default: {
        organization: { findUnique: vi.fn(), updateMany: vi.fn() },
        user: { findUnique: vi.fn() },
    },
}));
vi.mock("@/lib/purgeOrganization", () => ({ purgeOrganization: vi.fn() }));
vi.mock("@/lib/clerkWebhook", () => ({ anonymizeUser: vi.fn() }));
vi.mock("@clerk/nextjs/errors", () => ({
    isClerkAPIResponseError: (error: unknown) => typeof error === "object" && error !== null && "status" in error,
}));

import { anonymizeUser } from "@/lib/clerkWebhook";
import prisma from "@/lib/prisma";
import { purgeOrganization } from "@/lib/purgeOrganization";
import { allPages, blockedMessage, deleteAccount, deleteOrganizationEverywhere, planAccountDeletion } from "./deletion";

type Member = { role: string; publicUserData: { userId: string } };

// A Clerk client with the given organizations (each with its members) for user "me".
function fakeClerk(organizations: { id: string; name: string; members: Member[] }[]) {
    return {
        users: {
            getOrganizationMembershipList: vi.fn(async () => ({
                data: organizations
                    .filter((o) => o.members.some((m) => m.publicUserData.userId === "me"))
                    .map((o) => ({
                        role: o.members.find((m) => m.publicUserData.userId === "me")!.role,
                        organization: { id: o.id, name: o.name },
                    })),
            })),
            deleteUser: vi.fn(),
        },
        organizations: {
            getOrganizationMembershipList: vi.fn(async ({ organizationId }: { organizationId: string }) => ({
                data: organizations.find((o) => o.id === organizationId)!.members,
            })),
            deleteOrganization: vi.fn(),
        },
    };
}
type FakeClerk = ReturnType<typeof fakeClerk>;
const asClerk = (clerk: FakeClerk) => clerk as unknown as Parameters<typeof planAccountDeletion>[0];

const member = (userId: string, role = "org:member"): Member => ({ role, publicUserData: { userId } });

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({ id: "local1" } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "user1" } as never);
});

describe("planAccountDeletion", () => {
    it("deletes organizations you're alone in, blocks those you're the only admin of, and ignores the rest", async () => {
        const clerk = fakeClerk([
            { id: "solo", name: "Solo Rentals", members: [member("me", "org:admin")] },
            { id: "led", name: "Acme", members: [member("me", "org:admin"), member("sam")] },
            { id: "shared", name: "Shared", members: [member("me", "org:admin"), member("ana", "org:admin")] },
            { id: "joined", name: "Joined", members: [member("me"), member("ana", "org:admin")] },
        ]);

        expect(await planAccountDeletion(asClerk(clerk), "me")).toEqual({
            blockedBy: ["Acme"],
            organizationsToDelete: [{ clerkOrgId: "solo", name: "Solo Rentals" }],
        });
    });

    it("words the block for one or several organizations", () => {
        expect(blockedMessage(["Acme"])).toContain("only admin of Acme.");
        expect(blockedMessage(["A", "B", "C"])).toContain("only admin of A, B and C.");
    });
});

describe("deleteAccount", () => {
    it("refuses without deleting anything when you'd leave an organization with no admin", async () => {
        const clerk = fakeClerk([{ id: "led", name: "Acme", members: [member("me", "org:admin"), member("sam")] }]);

        expect(await deleteAccount(asClerk(clerk), "me")).toEqual({ ok: false, error: blockedMessage(["Acme"]) });
        expect(clerk.users.deleteUser).not.toHaveBeenCalled();
        expect(clerk.organizations.deleteOrganization).not.toHaveBeenCalled();
    });

    it("deletes your solo organizations, then you in Clerk, then clears your name and email", async () => {
        const clerk = fakeClerk([
            { id: "solo", name: "Solo", members: [member("me", "org:admin")] },
            { id: "joined", name: "Joined", members: [member("me"), member("ana", "org:admin")] },
        ]);

        expect(await deleteAccount(asClerk(clerk), "me")).toEqual({ ok: true });

        expect(clerk.organizations.deleteOrganization).toHaveBeenCalledExactlyOnceWith("solo");
        expect(purgeOrganization).toHaveBeenCalledWith("local1");
        expect(clerk.users.deleteUser).toHaveBeenCalledWith("me");
        expect(anonymizeUser).toHaveBeenCalledWith("user1");
        expect(clerk.organizations.deleteOrganization.mock.invocationCallOrder[0]).toBeLessThan(
            clerk.users.deleteUser.mock.invocationCallOrder[0],
        );
    });

    it("skips clearing the user row when it went with an organization", async () => {
        vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
        const clerk = fakeClerk([]);

        expect(await deleteAccount(asClerk(clerk), "me")).toEqual({ ok: true });
        expect(anonymizeUser).not.toHaveBeenCalled();
    });
});

describe("allPages", () => {
    it("fetches page after page until it has everything", async () => {
        const all = Array.from({ length: 230 }, (_, i) => i);
        const fetchPage = vi.fn(async ({ limit, offset }: { limit: number; offset: number }) => ({
            data: all.slice(offset, offset + limit),
            totalCount: all.length,
        }));

        expect(await allPages(fetchPage)).toEqual(all);
        expect(fetchPage.mock.calls.map(([page]) => page.offset)).toEqual([0, 100, 200]);
    });

    it("stops after one call for a short list", async () => {
        const fetchPage = vi.fn(async () => ({ data: ["a"], totalCount: 1 }));
        expect(await allPages(fetchPage)).toEqual(["a"]);
        expect(fetchPage).toHaveBeenCalledOnce();
    });
});

describe("deleteOrganizationEverywhere", () => {
    it("deletes in Clerk first, then purges the data", async () => {
        const clerk = fakeClerk([]);

        await deleteOrganizationEverywhere(asClerk(clerk), "clerk_org1");

        expect(clerk.organizations.deleteOrganization).toHaveBeenCalledWith("clerk_org1");
        expect(prisma.organization.findUnique).toHaveBeenCalledWith({
            where: { clerkOrgId: "clerk_org1" },
            select: { id: true },
        });
        expect(purgeOrganization).toHaveBeenCalledWith("local1");
    });

    it("treats an organization already gone from Clerk as deleted", async () => {
        const clerk = fakeClerk([]);
        clerk.organizations.deleteOrganization.mockRejectedValue({ status: 404 });

        await deleteOrganizationEverywhere(asClerk(clerk), "clerk_org1");

        expect(purgeOrganization).toHaveBeenCalledWith("local1");
    });

    it("stops before touching any data when Clerk refuses", async () => {
        const clerk = fakeClerk([]);
        clerk.organizations.deleteOrganization.mockRejectedValue({ status: 500 });

        await expect(deleteOrganizationEverywhere(asClerk(clerk), "clerk_org1")).rejects.toEqual({ status: 500 });
        expect(purgeOrganization).not.toHaveBeenCalled();
    });

    it("locks the organization for the cleanup job when the purge fails after Clerk's delete", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        vi.mocked(purgeOrganization).mockRejectedValue(new Error("database hiccup"));

        await deleteOrganizationEverywhere(asClerk(fakeClerk([])), "clerk_org1");

        expect(prisma.organization.updateMany).toHaveBeenCalledWith({
            where: { id: "local1" },
            data: { deletedAt: new Date(0) },
        });
    });
});
