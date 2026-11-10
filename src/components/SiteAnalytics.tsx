"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";
import { cleanAnalyticsUrl } from "@/lib/analytics";

// Vercel Web Analytics: anonymous page view counts, no cookies. Every URL is cleaned first (contractor link tokens
// and query strings removed; src/lib/analytics.ts). It only records on Vercel deployments.
function beforeSend(event: BeforeSendEvent): BeforeSendEvent {
    return { ...event, url: cleanAnalyticsUrl(event.url) };
}

export default function SiteAnalytics(): React.ReactElement {
    return <Analytics beforeSend={beforeSend} />;
}
