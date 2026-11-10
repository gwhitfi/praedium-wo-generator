// Starts Sentry in the browser, before the app's code runs. Same settings as the server (src/lib/sentry.ts):
// errors only, scrubbed, and only on Vercel production. NEXT_PUBLIC_DEPLOY_ENV is VERCEL_ENV, baked in by
// next.config.ts at build time.
import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/sentry";

Sentry.init(
    sentryOptions({
        dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
        environment: process.env.NEXT_PUBLIC_DEPLOY_ENV || undefined,
    }),
);

// Sentry's navigation hook. With tracing off it records nothing; exporting it keeps the build from warning.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
