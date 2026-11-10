import { describe, expect, it } from "vitest";
import { scrubEvent, scrubSecrets, sentryOptions } from "./sentry";

const token = "OUFDh3kq9zXy2ZcBbLmNoPqRsTuVwX01";
const apiKey = `pr_${"a1B2c3D4e5".repeat(4)}xyz`;

describe("scrubSecrets", () => {
    it("hides contractor link tokens and API keys in every string, however deep", () => {
        const scrubbed = scrubSecrets({
            message: `Failed to load https://app.example.com/wo/${token}/list`,
            nested: { list: [`GET /wo/${token}/photos/abc`, `Bearer ${apiKey}`] },
            count: 3,
            none: null,
        });

        expect(scrubbed).toEqual({
            message: "Failed to load https://app.example.com/wo/[token]/list",
            nested: { list: ["GET /wo/[token]/photos/abc", "Bearer pr_[redacted]"] },
            count: 3,
            none: null,
        });
    });

    it("leaves route patterns and ordinary paths alone, and doesn't change the original", () => {
        const original = { path: "/wo/[token]", other: "/work-orders/cm123" };
        expect(scrubSecrets(original)).toEqual(original);

        const withToken = { url: `/wo/${token}` };
        scrubSecrets(withToken);
        expect(withToken.url).toBe(`/wo/${token}`);
    });
});

describe("scrubEvent", () => {
    it("drops cookies, headers, the request body and the IP address", () => {
        const event = scrubEvent({
            message: "boom",
            request: {
                url: `https://app.example.com/wo/${token}`,
                cookies: { praedium_contractor: "secret" },
                headers: { authorization: `Bearer ${apiKey}` },
                data: { tenantEmail: "ana@example.com" },
            },
            user: { id: "user1", ip_address: "203.0.113.4" },
        });

        expect(event).toEqual({
            message: "boom",
            request: { url: "https://app.example.com/wo/[token]" },
            user: { id: "user1" },
        });
    });
});

describe("sentryOptions", () => {
    it("reports only from production with a DSN, without personal data or tracing", () => {
        const options = sentryOptions({ dsn: "https://key@o1.ingest.sentry.io/2", environment: "production" });

        expect(options).toMatchObject({ enabled: true, environment: "production", sendDefaultPii: false });
        expect(options).not.toHaveProperty("tracesSampleRate");
    });

    it("stays off in previews, in development and without a DSN", () => {
        const dsn = "https://key@o1.ingest.sentry.io/2";
        expect(sentryOptions({ dsn, environment: "preview" }).enabled).toBe(false);
        expect(sentryOptions({ dsn, environment: undefined })).toMatchObject({
            enabled: false,
            environment: "development",
        });
        expect(sentryOptions({ dsn: undefined, environment: "production" }).enabled).toBe(false);
    });

    it("scrubs events and breadcrumbs before they leave", () => {
        const options = sentryOptions({ dsn: undefined, environment: undefined });

        expect(options.beforeBreadcrumb({ category: "navigation", data: { to: `/wo/${token}` } })).toEqual({
            category: "navigation",
            data: { to: "/wo/[token]" },
        });
        expect(options.beforeSend({ request: { url: `/wo/${token}`, headers: { a: "b" } } })).toEqual({
            request: { url: "/wo/[token]" },
        });
    });
});
