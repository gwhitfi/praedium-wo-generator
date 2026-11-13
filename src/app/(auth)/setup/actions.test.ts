import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(), clerkClient: vi.fn() }));
vi.mock("@clerk/nextjs/errors", () => ({
    isClerkAPIResponseError: (error: unknown) => typeof error === "object" && error !== null && "status" in error,
}));
vi.mock("@/lib/prisma", () => ({
    default: { organization: { updateMany: vi.fn(), findUnique: vi.fn() } },
}));
vi.mock("@/lib/purgeOrganization", () => ({ purgeOrganization: vi.fn() }));

import { auth, clerkClient } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import { restoreOrganization } from "./actions";

const DAY_MS = 24 * 60 * 60 * 1000;
const ORG = "org_2abcDEF123";
const getOrganizationMembershipList = vi.fn();

function member(role: string, userId = "user_me") {
    return { data: [{ role, publicUserData: { userId } }], totalCount: 1 };
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.mocked(auth).mockResolvedValue({ userId: "user_me" } as never);
    vi.mocked(clerkClient).mockResolvedValue({ organizations: { getOrganizationMembershipList } } as never);
    getOrganizationMembershipList.mockResolvedValue(member("org:admin"));
    vi.mocked(prisma.organization.updateMany).mockResolvedValue({ count: 1 } as never);
});

describe("restoreOrganization", () => {
    it("restores an organization still inside the 7-day window for an admin", async () => {
        const before = Date.now();

        expect(await restoreOrganization(ORG)).toEqual({ ok: true });

        expect(getOrganizationMembershipList).toHaveBeenCalledWith({
            organizationId: ORG,
            userId: ["user_me"],
            limit: 1,
        });
        const call = vi.mocked(prisma.organization.updateMany).mock.calls[0][0];
        expect(call.data).toEqual({ deletedAt: null });
        expect(call.where).toMatchObject({ clerkOrgId: ORG, deletedAt: { not: null, gt: expect.any(Date) } });
        const cutoff = (call.where?.deletedAt as { gt: Date }).gt.getTime();
        expect(cutoff).toBeGreaterThanOrEqual(before - 7 * DAY_MS);
        expect(cutoff).toBeLessThanOrEqual(Date.now() - 7 * DAY_MS);
    });

    it("refuses once the window has passed", async () => {
        vi.mocked(prisma.organization.updateMany).mockResolvedValue({ count: 0 } as never);
        vi.mocked(prisma.organization.findUnique).mockResolvedValue({
            id: "org1",
            deletedAt: new Date(Date.now() - 8 * DAY_MS),
        } as never);

        expect(await restoreOrganization(ORG)).toEqual({
            ok: false,
            error: "This organization can't be restored any more.",
        });
    });

    it("answers not found when the organization doesn't exist in Praedium or Clerk", async () => {
        vi.mocked(prisma.organization.updateMany).mockResolvedValue({ count: 0 } as never);
        vi.mocked(prisma.organization.findUnique).mockResolvedValue(null);
        expect(await restoreOrganization(ORG)).toEqual({ ok: false, error: "This organization wasn't found." });

        getOrganizationMembershipList.mockRejectedValue({ status: 404 });
        expect(await restoreOrganization(ORG)).toEqual({ ok: false, error: "This organization wasn't found." });
    });

    it("counts one already restored by another admin as done", async () => {
        vi.mocked(prisma.organization.updateMany).mockResolvedValue({ count: 0 } as never);
        vi.mocked(prisma.organization.findUnique).mockResolvedValue({ id: "org1", deletedAt: null } as never);

        expect(await restoreOrganization(ORG)).toEqual({ ok: true });
    });

    it("refuses a member who isn't an admin in Clerk", async () => {
        getOrganizationMembershipList.mockResolvedValue(member("org:member"));

        expect(await restoreOrganization(ORG)).toEqual({
            ok: false,
            error: "Only an admin can restore the organization.",
        });
        expect(prisma.organization.updateMany).not.toHaveBeenCalled();
    });

    it("refuses someone who isn't a member at all", async () => {
        getOrganizationMembershipList.mockResolvedValue({ data: [], totalCount: 0 });

        expect(await restoreOrganization(ORG)).toEqual({ ok: false, error: "This organization wasn't found." });
        expect(prisma.organization.updateMany).not.toHaveBeenCalled();
    });

    it("refuses a signed-out caller", async () => {
        vi.mocked(auth).mockResolvedValue({ userId: null } as never);

        expect(await restoreOrganization(ORG)).toEqual({ ok: false, error: "Sign in to restore an organization." });
        expect(getOrganizationMembershipList).not.toHaveBeenCalled();
        expect(prisma.organization.updateMany).not.toHaveBeenCalled();
    });

    it.each([["" as unknown], ["org1"], [{ not: "" }], [null], ["org_abc; drop"]])(
        "refuses a bad argument (%o) before asking anyone",
        async (bad) => {
            expect(await restoreOrganization(bad as string)).toEqual({
                ok: false,
                error: "This organization wasn't found.",
            });
            expect(auth).not.toHaveBeenCalled();
            expect(prisma.organization.updateMany).not.toHaveBeenCalled();
        },
    );

    it("explains an unexpected failure instead of throwing", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        getOrganizationMembershipList.mockRejectedValue({ status: 500 });

        expect(await restoreOrganization(ORG)).toEqual({
            ok: false,
            error: "Couldn't restore the organization. Try again.",
        });
    });
});
