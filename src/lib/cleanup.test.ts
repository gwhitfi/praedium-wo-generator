import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
    default: {
        organization: { findMany: vi.fn() },
        emailLog: { deleteMany: vi.fn() },
        contractorChallenge: { deleteMany: vi.fn() },
        contractorSession: { deleteMany: vi.fn() },
        rateLimit: { deleteMany: vi.fn() },
    },
}));
vi.mock("@/lib/purgeOrganization", () => ({ purgeOrganization: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: vi.fn() }));
vi.mock("@clerk/nextjs/errors", () => ({
    isClerkAPIResponseError: (error: unknown) => typeof error === "object" && error !== null && "status" in error,
}));

import { clerkClient } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import { purgeOrganization } from "@/lib/purgeOrganization";
import { restoreCutoff, restoreDeadline, runCleanup } from "./cleanup";

const DAY_MS = 24 * 60 * 60 * 1000;
const now = new Date("2026-11-10T08:00:00Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * DAY_MS);
const deleteOrganization = vi.fn();

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    deleteOrganization.mockResolvedValue({});
    vi.mocked(clerkClient).mockResolvedValue({ organizations: { deleteOrganization } } as never);
    vi.mocked(prisma.organization.findMany).mockResolvedValue([
        { id: "org1", clerkOrgId: "clerk_org1" },
        { id: "org2", clerkOrgId: "clerk_org2" },
    ] as never);
    vi.mocked(prisma.emailLog.deleteMany).mockResolvedValue({ count: 4 } as never);
    vi.mocked(prisma.contractorChallenge.deleteMany).mockResolvedValue({ count: 2 } as never);
    vi.mocked(prisma.contractorSession.deleteMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(prisma.rateLimit.deleteMany).mockResolvedValue({ count: 9 } as never);
});

describe("runCleanup", () => {
    it("purges organizations deleted over 7 days ago and trims old rows, reporting each count", async () => {
        const report = await runCleanup(now);

        expect(report).toEqual({
            done: {
                organizationsPurged: 2,
                emailLogsDeleted: 4,
                challengesDeleted: 2,
                sessionsDeleted: 1,
                rateLimitsDeleted: 9,
            },
            failed: [],
        });
        expect(prisma.organization.findMany).toHaveBeenCalledWith({
            where: { deletedAt: { lt: daysAgo(7) } },
            select: { id: true, clerkOrgId: true },
        });
        expect(deleteOrganization).toHaveBeenCalledWith("clerk_org1");
        expect(deleteOrganization).toHaveBeenCalledWith("clerk_org2");
        expect(purgeOrganization).toHaveBeenCalledWith("org1");
        expect(purgeOrganization).toHaveBeenCalledWith("org2");
        expect(prisma.emailLog.deleteMany).toHaveBeenCalledWith({ where: { createdAt: { lt: daysAgo(90) } } });
        expect(prisma.contractorChallenge.deleteMany).toHaveBeenCalledWith({
            where: { expiresAt: { lt: daysAgo(1) } },
        });
        expect(prisma.contractorSession.deleteMany).toHaveBeenCalledWith({
            where: {
                OR: [
                    { expiresAt: { lt: daysAgo(30) } },
                    { revokedAt: { lt: daysAgo(30) } },
                    { createdAt: { lt: daysAgo(210) } },
                ],
            },
        });
        expect(prisma.rateLimit.deleteMany).toHaveBeenCalledWith({ where: { resetAt: { lt: now } } });
    });

    it("deletes each organization in Clerk before purging its data", async () => {
        await runCleanup(now);

        const clerkOrder = deleteOrganization.mock.invocationCallOrder;
        const purgeOrder = vi.mocked(purgeOrganization).mock.invocationCallOrder;
        expect(clerkOrder[0]).toBeLessThan(purgeOrder[0]);
        expect(clerkOrder[1]).toBeLessThan(purgeOrder[1]);
    });

    it("treats an organization already gone from Clerk as deleted", async () => {
        deleteOrganization.mockRejectedValue({ status: 404 });

        const report = await runCleanup(now);

        expect(report.failed).toEqual([]);
        expect(report.done.organizationsPurged).toBe(2);
        expect(purgeOrganization).toHaveBeenCalledTimes(2);
    });

    it("doesn't call Clerk when nothing is due", async () => {
        vi.mocked(prisma.organization.findMany).mockResolvedValue([]);

        expect((await runCleanup(now)).done.organizationsPurged).toBe(0);
        expect(clerkClient).not.toHaveBeenCalled();
    });

    it("fails the task when Clerk refuses, without touching that organization's data", async () => {
        deleteOrganization.mockRejectedValueOnce({ status: 500 });

        const report = await runCleanup(now);

        expect(report.failed).toEqual([{ task: "organizationsPurged", error: expect.any(Error) }]);
        expect(purgeOrganization).not.toHaveBeenCalledWith("org1");
        // The other organization is still purged.
        expect(purgeOrganization).toHaveBeenCalledWith("org2");
    });

    it("fails the task when a purge fails, and carries on with the other tasks", async () => {
        const failure = new Error("purge failed");
        vi.mocked(purgeOrganization).mockRejectedValueOnce(failure);

        const report = await runCleanup(now);

        expect(report.failed).toHaveLength(1);
        expect(report.failed[0].task).toBe("organizationsPurged");
        expect((report.failed[0].error as Error).cause).toBe(failure);
        expect(purgeOrganization).toHaveBeenCalledWith("org2");
        expect(report.done).toMatchObject({ emailLogsDeleted: 4, rateLimitsDeleted: 9 });
    });
});

describe("restore window", () => {
    it("is 7 days, and the deadline and cutoff agree", () => {
        const deletedAt = new Date("2026-11-13T15:30:00Z");
        expect(restoreDeadline(deletedAt)).toEqual(new Date("2026-11-20T15:30:00Z"));
        expect(restoreCutoff(restoreDeadline(deletedAt))).toEqual(deletedAt);
    });
});
