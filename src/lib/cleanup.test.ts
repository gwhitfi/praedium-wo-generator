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

import prisma from "@/lib/prisma";
import { purgeOrganization } from "@/lib/purgeOrganization";
import { runCleanup } from "./cleanup";

const DAY_MS = 24 * 60 * 60 * 1000;
const now = new Date("2026-11-10T08:00:00Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * DAY_MS);

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.organization.findMany).mockResolvedValue([{ id: "org1" }, { id: "org2" }] as never);
    vi.mocked(prisma.emailLog.deleteMany).mockResolvedValue({ count: 4 } as never);
    vi.mocked(prisma.contractorChallenge.deleteMany).mockResolvedValue({ count: 2 } as never);
    vi.mocked(prisma.contractorSession.deleteMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(prisma.rateLimit.deleteMany).mockResolvedValue({ count: 9 } as never);
});

describe("runCleanup", () => {
    it("purges organizations deleted over 29 days ago and trims old rows, reporting each count", async () => {
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
            where: { deletedAt: { lt: daysAgo(29) } },
            select: { id: true },
        });
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

    it("carries on after a task fails, and reports which one", async () => {
        const failure = new Error("purge failed");
        vi.mocked(purgeOrganization).mockRejectedValueOnce(failure);

        const report = await runCleanup(now);

        expect(report.failed).toEqual([{ task: "organizationsPurged", error: failure }]);
        expect(report.done).toMatchObject({ emailLogsDeleted: 4, rateLimitsDeleted: 9 });
    });
});
