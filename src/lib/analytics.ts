// Cleans a page view before Vercel Web Analytics records it (src/components/SiteAnalytics.tsx). Shared with the
// browser. A contractor link's token works without signing in, so it's replaced with "[token]"; the query string is
// dropped everywhere, since the verification link carries a one-time code in it and the rest is filters and sorting.
import { scrubSecrets } from "./sentry";

export function cleanAnalyticsUrl(url: string): string {
    try {
        const parsed = new URL(url);
        return scrubSecrets(`${parsed.origin}${parsed.pathname}`);
    } catch {
        // Not a full URL: keep only the path, scrubbed.
        return scrubSecrets(url.split(/[?#]/)[0]);
    }
}
