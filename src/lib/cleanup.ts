// Server-only. The daily cleanup job (src/app/api/cron/cleanup/route.ts): removes what Praedium no longer needs.
// Each task runs on its own, so one failure doesn't stop the rest; the route reports any that failed.
import { clerkClient } from "@clerk/nextjs/server";
import { MAX_SESSION_DAYS } from "@/lib/contractorAccess";
import { deleteClerkOrganization } from "@/lib/deletion";
import prisma from "@/lib/prisma";
import { purgeOrganization } from "@/lib/purgeOrganization";

const DAY_MS = 24 * 60 * 60 * 1000;

// How long things are kept. The Privacy Policy states the organization and email log periods.
export const KEEP_DAYS = {
    // An organization locked in Praedium (Settings → Delete organization) or deleted in Clerk (webhook) is purged
    // after this long, so with a daily run it's gone within 8 days. Until then an admin can restore one locked in
    // Praedium from /setup.
    deletedOrganization: 7,
    emailLog: 90,
    // Verification codes expire after 10 minutes; the rows are kept a day for troubleshooting.
    contractorChallenge: 1,
    // Ended contractor sessions (expired or signed out), kept briefly for "Sign out all devices" counts.
    endedContractorSession: 30,
} as const;

// The last moment an organization locked at `deletedAt` can be restored; the cleanup job purges it after that. Used
// by /setup, the restore action and the notice email, so they all name the same date.
export function restoreDeadline(deletedAt: Date): Date {
    return new Date(deletedAt.getTime() + KEEP_DAYS.deletedOrganization * DAY_MS);
}

// Organizations locked before this moment are past their restore deadline.
export function restoreCutoff(now: Date): Date {
    return new Date(now.getTime() - KEEP_DAYS.deletedOrganization * DAY_MS);
}

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

    // Clerk first, then the data, as Settings did before the waiting period. Each organization is tried on its own;
    // any failure fails the task (so the run reports an error) and the next run tries again.
    await task("organizationsPurged", async () => {
        const due = await prisma.organization.findMany({
            where: { deletedAt: { lt: restoreCutoff(now) } },
            select: { id: true, clerkOrgId: true },
        });
        if (due.length === 0) return 0;
        const clerk = await clerkClient();
        const errors: unknown[] = [];
        for (const organization of due) {
            try {
                await deleteClerkOrganization(clerk, organization.clerkOrgId);
                await purgeOrganization(organization.id);
            } catch (error) {
                console.error(`Cleanup: purging organization ${organization.id} failed`, error);
                errors.push(error);
            }
        }
        if (errors.length > 0) {
            throw new Error(`${errors.length} of ${due.length} organizations couldn't be purged`, { cause: errors[0] });
        }
        return due.length;
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
