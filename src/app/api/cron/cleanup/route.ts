import { timingSafeEqual } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { runCleanup } from "@/lib/cleanup";

// Constant-time, so the secret can't be guessed a character at a time from response timing.
function matches(given: string, expected: string): boolean {
    const a = Buffer.from(given);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
}

// Sentry's monitor for this job, created or updated by every check-in. The schedule matches vercel.json. Vercel's
// Hobby plan starts a daily job at any time within its hour, so a check-in up to 90 minutes late is still on time; a
// day with no check-in, or a failed run, opens an issue in Sentry.
const monitorConfig = {
    schedule: { type: "crontab", value: "0 8 * * *" },
    timezone: "UTC",
    checkinMargin: 90,
    failureIssueThreshold: 1,
    recoveryThreshold: 1,
} satisfies Parameters<typeof Sentry.captureCheckIn>[1];

// The daily cleanup job (src/lib/cleanup.ts), scheduled in vercel.json. Vercel calls it on production with
// "Authorization: Bearer <CRON_SECRET>"; anything else is refused, and without the secret it doesn't run at all.
// Each run that gets past those checks tells Sentry it ran (Sentry only reports from production).
export async function GET(request: Request): Promise<Response> {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
        console.error("Cleanup: CRON_SECRET is not set");
        return new Response("Not configured", { status: 503 });
    }
    if (!matches(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
        return new Response("Unauthorized", { status: 401 });
    }

    const report = await runCleanup();
    console.info("Cleanup done", report.done);
    for (const { task, error } of report.failed) {
        console.error(`Cleanup: ${task} failed`, error);
        Sentry.captureException(error, { tags: { cleanupTask: task } });
    }
    Sentry.captureCheckIn({ monitorSlug: "cleanup", status: report.failed.length > 0 ? "error" : "ok" }, monitorConfig);
    // Nothing else sends manually captured events before the function can be suspended.
    await Sentry.flush(2000);
    return Response.json(
        { done: report.done, failed: report.failed.map((failure) => failure.task) },
        { status: report.failed.length > 0 ? 500 : 200 },
    );
}
