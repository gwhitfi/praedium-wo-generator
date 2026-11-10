import * as Sentry from "@sentry/nextjs";
import type { Instrumentation } from "next";

// Runs once when a server instance starts. Logs any missing or malformed environment variable by name (see
// src/lib/env.ts) without stopping the server; production builds on Vercel already refuse to deploy with one.
// Then starts Sentry (src/lib/sentry.ts), which reports only from Vercel production.
export async function register(): Promise<void> {
    if (process.env.NEXT_RUNTIME !== "nodejs") return;
    const { checkEnv } = await import("./lib/env");
    const env = checkEnv(process.env);
    if (!env.ok) console.error(`Environment check failed:\n- ${env.problems.join("\n- ")}`);

    const { sentryOptions } = await import("./lib/sentry");
    Sentry.init(sentryOptions({ dsn: process.env.NEXT_PUBLIC_SENTRY_DSN, environment: process.env.VERCEL_ENV }));
}

// Errors thrown while rendering a page, in a Server Action, a route handler or the proxy. The digest is the
// "Error ID" src/app/error.tsx shows, so a user's ID can be searched in Sentry as digest:<id>.
export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
    Sentry.withScope((scope) => {
        const digest =
            typeof error === "object" && error !== null && "digest" in error ? String(error.digest) : undefined;
        if (digest) scope.setTag("digest", digest);
        Sentry.captureRequestError(error, request, context);
    });
};
