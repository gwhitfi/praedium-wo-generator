// Shared Sentry settings for the server (src/instrumentation.ts) and the browser (src/instrumentation-client.ts).
// Errors only: no tracing, no session replay, no personal data. Reports go out only from Vercel production, and
// every event is scrubbed of contractor link tokens, API keys, cookies, headers and request bodies first.

// A contractor link (/wo/<token>) works without signing in, so its token is a password. API keys are pr_<secret>.
const SECRETS: [RegExp, string][] = [
    [/\/wo\/[A-Za-z0-9_-]{16,}/g, "/wo/[token]"],
    [/pr_[A-Za-z0-9_-]{20,}/g, "pr_[redacted]"],
];

function scrubString(value: string): string {
    return SECRETS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
}

// Every string anywhere in the value, with the secrets above replaced. Objects and arrays are copied, not changed.
export function scrubSecrets<T>(value: T, depth = 0): T {
    if (typeof value === "string") return scrubString(value) as T;
    if (depth > 20 || value === null || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map((item) => scrubSecrets(item, depth + 1)) as T;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, scrubSecrets(item, depth + 1)])) as T;
}

type EventLike = { request?: object; user?: object };

// What leaves for Sentry: no cookies, headers or request body (tenant details, session cookies, Authorization
// headers, form data), no IP address, and no secrets in any remaining string.
export function scrubEvent<T extends EventLike>(event: T): T {
    const copy = scrubSecrets(event);
    // scrubSecrets made fresh copies, so deleting here doesn't touch the caller's objects.
    const request = copy.request as Record<string, unknown> | undefined;
    if (request) {
        delete request.cookies;
        delete request.headers;
        delete request.data;
    }
    const user = copy.user as Record<string, unknown> | undefined;
    if (user) delete user.ip_address;
    return copy;
}

// The options both runtimes pass to Sentry.init. `environment` is VERCEL_ENV on the server and
// NEXT_PUBLIC_DEPLOY_ENV (the same value, baked in at build) in the browser; anything but "production" (or no DSN)
// turns reporting off.
export function sentryOptions({ dsn, environment }: { dsn: string | undefined; environment: string | undefined }): {
    dsn: string | undefined;
    enabled: boolean;
    environment: string;
    sendDefaultPii: false;
    beforeSend: <E extends EventLike>(event: E) => E;
    beforeBreadcrumb: <B>(breadcrumb: B) => B;
} {
    return {
        dsn,
        enabled: !!dsn && environment === "production",
        environment: environment ?? "development",
        sendDefaultPii: false,
        // No tracesSampleRate: tracing stays off.
        beforeSend: (event) => scrubEvent(event),
        beforeBreadcrumb: (breadcrumb) => scrubSecrets(breadcrumb),
    };
}
