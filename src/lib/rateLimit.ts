// Server-only. Fixed-window rate limiting backed by the Postgres `RateLimit` table: each bucket counts requests until
// its window ends, then starts over at 1. The key prefix namespaces buckets (`mcp:`, `mcp-auth:`, `contractor:`,
// `verify-send:`, `verify-ip:`, `verify-email:`, `bot:`, `email:`, `email-to:`, `email-account`). It fails open: if the database call errors, the request is
// allowed so a hiccup never blocks real traffic.
import prisma from "@/lib/prisma";

export type RateLimitRule = { limit: number; windowSeconds: number };

export const RATE_LIMITS = {
    // Per API key hash, successful MCP requests.
    mcp: { limit: 120, windowSeconds: 60 },
    // Per IP, requests with a missing or invalid key.
    mcpAuthFailure: { limit: 20, windowSeconds: 60 },
    // Per public token, contractor page actions.
    contractor: { limit: 60, windowSeconds: 60 },
    // Per public token, verification codes sent.
    verifySend: { limit: 5, windowSeconds: 600 },
    // Per IP, verification codes sent.
    verifyIp: { limit: 10, windowSeconds: 600 },
    // Per contractor email, codes sent per day: bounds inbox spam from link holders; it's a shared budget, so it can't
    // stop a determined holder locking the contractor out for the day.
    verifyEmail: { limit: 10, windowSeconds: 86400 },
    // Per user, Praedium Bot parses (each one is a paid Anthropic call).
    bot: { limit: 30, windowSeconds: 3600 },
    // Per organization, work order emails from the office button and the MCP send tool.
    email: { limit: 60, windowSeconds: 3600 },
    // The email limits below are sized for Resend's free plan (100 emails a day, 3,000 a month, for the whole
    // account), so a bigger plan only needs bigger numbers here.
    // Per organization, every email Praedium sends for it (src/lib/emailLog.ts), so an abusive sign-up can't use
    // Praedium to mail arbitrary addresses. A new organization (first 24 hours) gets the smaller allowance.
    emailDay: { limit: 40, windowSeconds: 86400 },
    emailNewOrganization: { limit: 10, windowSeconds: 86400 },
    // Per organization and recipient address, every email except the deletion notice to admins.
    emailRecipient: { limit: 10, windowSeconds: 86400 },
    // The whole account, counting only emails Resend accepted. Verification codes and deletion notices may use all of
    // it (90 a day × 30 days stays under 3,000 a month); everything the office sends stops at `emailAccountOffice`,
    // which leaves them room. The owner is warned in Sentry once the day's total reaches `emailAccountWarning`.
    emailAccount: { limit: 90, windowSeconds: 86400 },
    emailAccountOffice: { limit: 80, windowSeconds: 86400 },
    emailAccountWarning: { limit: 70, windowSeconds: 86400 },
    // Each of those Sentry alerts at most once a day.
    emailAlert: { limit: 1, windowSeconds: 86400 },
    // Per public token, verification codes per day: one leaked link can't use up the organization's daily email.
    verifyTokenDay: { limit: 20, windowSeconds: 86400 },
    // Per organization, data exports (each reads the whole organization).
    export: { limit: 5, windowSeconds: 3600 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitResult = { ok: boolean; remaining: number; retryAfterSeconds: number };

export async function rateLimit(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
    try {
        const rows = await prisma.$queryRaw<{ count: number; resetAt: Date }[]>`
            INSERT INTO "RateLimit" ("key", "count", "resetAt")
            VALUES (${key}, 1, now() + ${rule.windowSeconds} * interval '1 second')
            ON CONFLICT ("key") DO UPDATE SET
                "count" = CASE WHEN "RateLimit"."resetAt" <= now() THEN 1 ELSE "RateLimit"."count" + 1 END,
                "resetAt" = CASE WHEN "RateLimit"."resetAt" <= now()
                    THEN now() + ${rule.windowSeconds} * interval '1 second'
                    ELSE "RateLimit"."resetAt" END
            RETURNING "count", "resetAt"
        `;
        const { count, resetAt } = rows[0];
        if (count === 1) {
            await prisma.$executeRaw`DELETE FROM "RateLimit" WHERE "resetAt" < now()`;
        }
        const ok = count <= rule.limit;
        return {
            ok,
            remaining: Math.max(0, rule.limit - count),
            retryAfterSeconds: ok ? 0 : Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000)),
        };
    } catch (error) {
        console.error("rateLimit failed", error);
        return { ok: true, remaining: rule.limit, retryAfterSeconds: 0 };
    }
}

// The current count of a bucket without adding to it: 0 when it doesn't exist or its window has ended. Fails open
// like rateLimit(): if the database call errors, it reads 0.
export async function peekRateLimit(key: string): Promise<number> {
    try {
        const rows = await prisma.$queryRaw<{ count: number; resetAt: Date }[]>`
            SELECT "count", "resetAt" FROM "RateLimit" WHERE "key" = ${key}
        `;
        const row = rows[0];
        if (!row || row.resetAt.getTime() <= Date.now()) return 0;
        return row.count;
    } catch (error) {
        console.error("peekRateLimit failed", error);
        return 0;
    }
}

export function clientIp(headers: Headers): string {
    const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (forwarded) return forwarded;
    return headers.get("x-real-ip") ?? "unknown";
}
