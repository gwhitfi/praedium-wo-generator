// Server-only. The daily cleanup job (src/app/api/cron/cleanup/route.ts): removes what Praedium no longer needs.
// Each task runs on its own, so one failure doesn't stop the rest; the route reports any that failed.
import { MAX_SESSION_DAYS } from "@/lib/contractorAccess";
import prisma from "@/lib/prisma";
import { purgeOrganization } from "@/lib/purgeOrganization";

const DAY_MS = 24 * 60 * 60 * 1000;

// How long things are kept. The Privacy Policy states the organization and email log periods.
export const KEEP_DAYS = {
    // An organization deleted in Clerk is locked at once (webhook) and purged after this long: 29 days, so with a
    // daily run it's gone within the 30 days the Privacy Policy promises.
    deletedOrganization: 29,
    emailLog: 90,
    // Verification codes expire after 10 minutes; the rows are kept a day for troubleshooting.
    contractorChallenge: 1,
    // Ended contractor sessions (expired or signed out), kept briefly for "Sign out all devices" counts.
    endedContractorSession: 30,
} as const;

export type CleanupReport = { done: Record<string, number>; failed: { task: string; error: unknown }[] };

export async function runCleanup(now: Date = new Date()): Promise<CleanupReport> {
    const ago = (days: number) => new Date(now.getTime() - days * DAY_MS);
    const report: CleanupReport = { done: {}, failed: [] };

    async function task(name: string, run: () => Promise<number>): Promise<void> {
        try {
            report.done[name] = await run();
        } catch (error) {
            report.failed.push({ task: name, error });
        }
    }

    await task("organizationsPurged", async () => {
        const due = await prisma.organization.findMany({
            where: { deletedAt: { lt: ago(KEEP_DAYS.deletedOrganization) } },
            select: { id: true },
        });
        let purged = 0;
        for (const organization of due) {
            await purgeOrganization(organization.id);
            purged++;
        }
        return purged;
    });
    await task("emailLogsDeleted", async () => {
        const { count } = await prisma.emailLog.deleteMany({ where: { createdAt: { lt: ago(KEEP_DAYS.emailLog) } } });
        return count;
    });
    await task("challengesDeleted", async () => {
        const { count } = await prisma.contractorChallenge.deleteMany({
            where: { expiresAt: { lt: ago(KEEP_DAYS.contractorChallenge) } },
        });
        return count;
    });
    await task("sessionsDeleted", async () => {
        const ended = ago(KEEP_DAYS.endedContractorSession);
        const { count } = await prisma.contractorSession.deleteMany({
            where: {
                OR: [
                    { expiresAt: { lt: ended } },
                    { revokedAt: { lt: ended } },
                    // Past the absolute limit, even if its expiry was extended before that limit existed.
                    { createdAt: { lt: ago(MAX_SESSION_DAYS + KEEP_DAYS.endedContractorSession) } },
                ],
            },
        });
        return count;
    });
    await task("rateLimitsDeleted", async () => {
        const { count } = await prisma.rateLimit.deleteMany({ where: { resetAt: { lt: now } } });
        return count;
    });

    return report;
}
