import { describe, expect, it } from "vitest";
import { clerkFrontendApiHost, contentSecurityPolicy, securityHeaders } from "./securityHeaders";

const key = (host: string, kind = "test") => `pk_${kind}_${Buffer.from(`${host}$`).toString("base64")}`;

describe("clerkFrontendApiHost", () => {
    it("decodes the host from a test or live publishable key", () => {
        expect(clerkFrontendApiHost(key("happy-cat-12.clerk.accounts.dev"))).toBe("happy-cat-12.clerk.accounts.dev");
        expect(clerkFrontendApiHost(key("clerk.example.com", "live"))).toBe("clerk.example.com");
    });

    it("returns null for a missing or malformed key", () => {
        expect(clerkFrontendApiHost(undefined)).toBeNull();
        expect(clerkFrontendApiHost("sk_test_abc")).toBeNull();
        const injected = `pk_test_${Buffer.from("not a host; script-src *$").toString("base64")}`;
        expect(clerkFrontendApiHost(injected)).toBeNull();
    });
});

describe("contentSecurityPolicy", () => {
    it("allows Clerk's host and nothing else from outside for scripts and connections", () => {
        const csp = contentSecurityPolicy({ clerkHost: "clerk.example.com", dev: false });

        expect(csp).toContain(
            "script-src 'self' 'unsafe-inline' https://clerk.example.com https://challenges.cloudflare.com",
        );
        expect(csp).toContain("connect-src 'self' https://clerk.example.com;");
        expect(csp).toContain("frame-ancestors 'none'");
        expect(csp).toContain("object-src 'none'");
        expect(csp).not.toContain("unsafe-eval");
        expect(csp).not.toContain("ws:");
    });

    it("adds eval and the hot-reload socket in dev, and falls back to Clerk's dev hosts", () => {
        const csp = contentSecurityPolicy({ clerkHost: null, dev: true });

        expect(csp).toContain("'unsafe-eval'");
        expect(csp).toContain("ws:");
        expect(csp).toContain("https://*.clerk.accounts.dev");
    });
});

describe("securityHeaders", () => {
    it("reports the full policy but enforces framing, sniffing, referrer and permissions", () => {
        const headers = Object.fromEntries(
            securityHeaders({ clerkHost: null, dev: false }).map(({ key, value }) => [key, value]),
        );

        expect(headers["Content-Security-Policy-Report-Only"]).toContain("default-src 'self'");
        expect(headers["Content-Security-Policy"]).toBe("frame-ancestors 'none'");
        expect(headers["X-Frame-Options"]).toBe("DENY");
        expect(headers["X-Content-Type-Options"]).toBe("nosniff");
        expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
        expect(headers["Permissions-Policy"]).toContain("camera=()");
    });
});
