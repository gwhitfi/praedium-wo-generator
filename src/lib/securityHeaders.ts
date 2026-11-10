// Response headers for every page, used by next.config.ts. The content security policy runs in report-only mode for
// now: browsers log what it would block (in the console) without blocking anything. Framing is refused for real,
// by X-Frame-Options and a separate enforced policy holding only frame-ancestors, which report-only would ignore.

// Clerk's Frontend API host is encoded in the publishable key: "pk_test_" or "pk_live_" and then base64 of
// "<host>$". Returns null when the key is missing or doesn't decode to a hostname.
export function clerkFrontendApiHost(publishableKey: string | undefined): string | null {
    const match = publishableKey?.match(/^pk_(?:test|live)_([A-Za-z0-9+/=_-]+)$/);
    if (!match) return null;
    const host = Buffer.from(match[1], "base64").toString("utf8").replace(/\$$/, "");
    return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host) ? host : null;
}

export function contentSecurityPolicy({ clerkHost, dev }: { clerkHost: string | null; dev: boolean }): string {
    // Dev instances live under clerk.accounts.dev; production uses a host on the app's own domain.
    const clerk = clerkHost ? `https://${clerkHost}` : "https://*.clerk.accounts.dev";
    // Cloudflare Turnstile, Clerk's bot check on sign-up.
    const turnstile = "https://challenges.cloudflare.com";
    const directives: Record<string, string[]> = {
        "default-src": ["'self'"],
        // Next.js and the theme startup script (src/lib/theme.ts) run inline scripts; dev also needs eval.
        "script-src": ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : []), clerk, turnstile],
        "style-src": ["'self'", "'unsafe-inline'"],
        // Photo previews before upload are blob: and data: URLs; Clerk serves avatars from img.clerk.com.
        "img-src": ["'self'", "data:", "blob:", "https://img.clerk.com"],
        "font-src": ["'self'", "data:"],
        // Dev's hot reload uses a websocket.
        "connect-src": ["'self'", clerk, ...(dev ? ["ws:"] : [])],
        "frame-src": ["'self'", turnstile],
        "worker-src": ["'self'", "blob:"],
        "form-action": ["'self'"],
        "base-uri": ["'self'"],
        "object-src": ["'none'"],
        "frame-ancestors": ["'none'"],
    };
    return Object.entries(directives)
        .map(([name, values]) => `${name} ${values.join(" ")}`)
        .join("; ");
}

export function securityHeaders(options: { clerkHost: string | null; dev: boolean }): { key: string; value: string }[] {
    return [
        { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicy(options) },
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        // The contractor link's token is in the path, so other sites only ever see our origin.
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        // Photos are added with the file picker, which needs none of these.
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
    ];
}
