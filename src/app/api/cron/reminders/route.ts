import * as Sentry from "@sentry/nextjs";
import { refuseCronRequest } from "@/lib/cronAuth";
import { sendOverdueReminders } from "@/lib/overdueReminders";

// Sentry's monitor for this job, created or updated by every check-in. The schedule matches vercel.json (14:00 UTC,
// morning in the US). As with the cleanup job, a check-in up to 90 minutes late is on time on Vercel's Hobby plan.
const monitorConfig = {
    schedule: { type: "crontab", value: "0 14 * * *" },
    timezone: "UTC",
    checkinMargin: 90,
    failureIssueThreshold: 1,
    recoveryThreshold: 1,
} satisfies Parameters<typeof Sentry.captureCheckIn>[1];

// The daily overdue reminder job (src/lib/overdueReminders.ts), scheduled in vercel.json and called by Vercel with
// the cron secret. A reminder that couldn't be sent counts as a failed run; it's tried again the next day.
export async function GET(request: Request): Promise<Response> {
    const refused = refuseCronRequest(request, "Reminders");
    if (refused) return refused;

    let status: "ok" | "error" = "ok";
    let body: { sent: number; skipped: number; failed: number };
    try {
        const report = await sendOverdueReminders();
        console.info("Reminders done", { sent: report.sent, skipped: report.skipped });
        for (const { workOrderId, error } of report.failed) {
            console.error(`Reminders: work order ${workOrderId} failed`, error);
            Sentry.captureException(error, { tags: { reminderWorkOrder: workOrderId } });
        }
        if (report.failed.length > 0) status = "error";
        body = { sent: report.sent, skipped: report.skipped, failed: report.failed.length };
    } catch (error) {
        console.error("Reminders: the run failed", error);
        Sentry.captureException(error);
        status = "error";
        body = { sent: 0, skipped: 0, failed: 0 };
    }

    Sentry.captureCheckIn({ monitorSlug: "reminders", status }, monitorConfig);
    // Nothing else sends manually captured events before the function can be suspended.
    await Sentry.flush(2000);
    return Response.json(body, { status: status === "ok" ? 200 : 500 });
}
