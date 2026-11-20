// Server-only. The check every scheduled job (vercel.json "crons") makes before running. Vercel calls them on
// production with "Authorization: Bearer <CRON_SECRET>"; anything else is refused, and without the secret no job runs.
import { timingSafeEqual } from "node:crypto";

// Constant-time, so the secret can't be guessed a character at a time from response timing.
function matches(given: string, expected: string): boolean {
    const a = Buffer.from(given);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
}

// Null when the request may run the job, or the response to send instead. `job` names it in the log.
export function refuseCronRequest(request: Request, job: string): Response | null {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
        console.error(`${job}: CRON_SECRET is not set`);
        return new Response("Not configured", { status: 503 });
    }
    if (!matches(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
        return new Response("Unauthorized", { status: 401 });
    }
    return null;
}
