import type { NextConfig } from "next";

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
};

export default nextConfig;
