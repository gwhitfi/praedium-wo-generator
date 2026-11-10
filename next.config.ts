import type { NextConfig } from "next";
import { checkEnv } from "./src/lib/env";
import { clerkFrontendApiHost, securityHeaders } from "./src/lib/securityHeaders";

// A production deploy on Vercel with a missing or malformed env var fails here, during the build, so it's never
// promoted and the current version keeps serving. Elsewhere (dev, previews, CI) src/instrumentation.ts only logs.
if (process.env.VERCEL_ENV === "production") {
    const env = checkEnv(process.env);
    if (!env.ok) throw new Error(`Environment check failed:\n- ${env.problems.join("\n- ")}`);
}

const nextConfig: NextConfig = {
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
        });
        return [{ source: "/:path*", headers }];
    },
};

export default nextConfig;
