import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";
import { checkEnv } from "./src/lib/env";
import { clerkFrontendApiHost, securityHeaders, sentryEndpoints } from "./src/lib/securityHeaders";

// A production deploy on Vercel with a missing or malformed env var fails here, during the build, so it's never
// promoted and the current version keeps serving. Elsewhere (dev, previews, CI) src/instrumentation.ts only logs.
if (process.env.VERCEL_ENV === "production") {
    const env = checkEnv(process.env);
    if (!env.ok) throw new Error(`Environment check failed:\n- ${env.problems.join("\n- ")}`);
}

const nextConfig: NextConfig = {
    // Baked into the browser build: "production", "preview" or "" (local, CI). Browser Sentry reports only from
    // production (src/instrumentation-client.ts), without relying on Vercel exposing NEXT_PUBLIC_VERCEL_ENV.
    env: { NEXT_PUBLIC_DEPLOY_ENV: process.env.VERCEL_ENV ?? "" },
    serverExternalPackages: ["@prisma/client", "@prisma/adapter-neon"],
    // Dev only: extra hostnames the dev server accepts for its hot-reload socket and internal assets, e.g. a tunnel
    // or VPN name used to test on a phone. Comma-separated, kept in .env.local so no hostname lands in the repo.
    allowedDevOrigins: process.env.ALLOWED_DEV_ORIGINS?.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    experimental: {
        serverActions: {
            // Photo uploads are up to 3 MB (MAX_PHOTO_BYTES) plus form overhead. Vercel caps request bodies at 4.5 MB.
            bodySizeLimit: "4mb",
        },
    },
    async headers() {
        const headers = securityHeaders({
            clerkHost: clerkFrontendApiHost(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY),
            dev: process.env.NODE_ENV !== "production",
            sentry: sentryEndpoints(process.env.NEXT_PUBLIC_SENTRY_DSN),
            // CSP reports go to Sentry from production only, so local and preview noise stays out of it.
            report: process.env.VERCEL_ENV === "production",
        });
        return [{ source: "/:path*", headers }];
    },
};

// Sentry's build step uploads source maps (so errors point at real lines), then deletes the browser's copies so
// they aren't served. It needs SENTRY_AUTH_TOKEN, set only for Vercel production; other builds skip the upload.
const uploadSourceMaps = !!process.env.SENTRY_AUTH_TOKEN;

export default withSentryConfig(nextConfig, {
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    silent: !process.env.CI,
    telemetry: false,
    sourcemaps: { disable: !uploadSourceMaps },
    release: { create: uploadSourceMaps },
    // Tracing is off (src/lib/sentry.ts), so its code is left out of the bundle.
    bundleSizeOptimizations: { excludeTracing: true, excludeDebugStatements: true },
    routeManifestInjection: false,
});
