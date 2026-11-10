import { timingSafeEqual } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { runCleanup } from "@/lib/cleanup";

// Constant-time, so the secret can't be guessed a character at a time from response timing.
function matches(given: string, expected: string): boolean {
    const a = Buffer.from(given);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
}

// The daily cleanup job (src/lib/cleanup.ts), scheduled in vercel.json. Vercel calls it on production with
// "Authorization: Bearer <CRON_SECRET>"; anything else is refused, and without the secret it doesn't run at all.
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
    return Response.json(
        { done: report.done, failed: report.failed.map((failure) => failure.task) },
        { status: report.failed.length > 0 ? 500 : 200 },
    );
}
