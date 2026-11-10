// The environment variables the app needs, checked in one place so a missing or mistyped one shows up at deploy
// rather than at first use. A production build on Vercel fails on a problem (next.config.ts), so the deploy is never
// promoted; the server logs problems when it starts (src/instrumentation.ts). The code that uses each variable still
// reads process.env itself. Problems name the variable and what's wrong, never its value.
import { z } from "zod";

const required = z.string().trim().min(1, "is missing");
const webhookSecret = z.string().trim().startsWith("whsec_", "isn't a webhook signing secret (whsec_…)").optional();

function isTimeZone(value: string): boolean {
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: value });
        return true;
    } catch {
        return false;
    }
}

const envSchema = z
    .object({
        DATABASE_URL: required,
        // Used by the Prisma CLI, which applies migrations during the production build.
        DATABASE_URL_UNPOOLED: required,
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: required.regex(/^pk_(test|live)_/, "isn't a Clerk publishable key"),
        CLERK_SECRET_KEY: required.regex(/^sk_(test|live)_/, "isn't a Clerk secret key"),
        ANTHROPIC_API_KEY: required,
        RESEND_API_KEY: required,
        EMAIL_FROM: required,
        APP_URL: required.pipe(z.url({ protocol: /^https?$/, error: "isn't an http(s) URL" })),
        APP_TIMEZONE: z.string().trim().refine(isTimeZone, "isn't an IANA time zone like America/New_York").optional(),
        // Photos: on Vercel the store is connected (BLOB_STORE_ID); locally a token points at the dev store.
        BLOB_STORE_ID: z.string().optional(),
        BLOB_READ_WRITE_TOKEN: z.string().optional(),
        // Error monitoring (src/lib/sentry.ts). Optional: without them nothing is reported and source maps aren't
        // uploaded, but nothing breaks. SENTRY_AUTH_TOKEN, SENTRY_ORG and SENTRY_PROJECT are only read by the build.
        NEXT_PUBLIC_SENTRY_DSN: z.url({ protocol: /^https$/, error: "isn't a Sentry DSN (https://…)" }).optional(),
        // Webhook signing secrets (src/app/api/webhooks/). Optional: without one, that webhook answers 503 and
        // nothing else changes.
        CLERK_WEBHOOK_SIGNING_SECRET: webhookSecret,
        RESEND_WEBHOOK_SECRET: webhookSecret,
    })
    .refine((env) => env.BLOB_STORE_ID || env.BLOB_READ_WRITE_TOKEN, {
        path: ["BLOB_STORE_ID"],
        message: "is missing (or set BLOB_READ_WRITE_TOKEN), so photos can't be stored",
    });

export type EnvCheck = { ok: true } | { ok: false; problems: string[] };

// Empty strings count as unset, as Vercel's dashboard can save them.
export function checkEnv(env: Record<string, string | undefined>): EnvCheck {
    const present = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== undefined && value !== ""));
    const parsed = envSchema.safeParse(present);
    if (parsed.success) return { ok: true };
    return {
        ok: false,
        problems: parsed.error.issues.map((issue) => {
            const name = String(issue.path[0] ?? "environment");
            // A missing key fails as "expected string" before reaching the rule's own message.
            const message = issue.code === "invalid_type" ? "is missing" : issue.message;
            return `${name} ${message}`;
        }),
    };
}
