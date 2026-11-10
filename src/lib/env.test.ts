import { describe, expect, it } from "vitest";
import { checkEnv } from "./env";

const valid = {
    DATABASE_URL: "postgres://pooled",
    DATABASE_URL_UNPOOLED: "postgres://direct",
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_abc",
    CLERK_SECRET_KEY: "sk_test_abc",
    ANTHROPIC_API_KEY: "anthropic-key",
    RESEND_API_KEY: "resend-key",
    EMAIL_FROM: "Praedium <notifications@example.com>",
    APP_URL: "https://example.com",
    APP_TIMEZONE: "America/New_York",
    BLOB_STORE_ID: "store_1",
};

describe("checkEnv", () => {
    it("accepts a complete environment", () => {
        expect(checkEnv(valid)).toEqual({ ok: true });
    });

    it("accepts a local Blob token instead of a connected store, and no time zone", () => {
        const env = { ...valid, BLOB_STORE_ID: undefined, APP_TIMEZONE: undefined };
        expect(checkEnv({ ...env, BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_x" })).toEqual({ ok: true });
    });

    it("names every missing variable, treating empty strings as missing", () => {
        const result = checkEnv({ ...valid, RESEND_API_KEY: "", ANTHROPIC_API_KEY: undefined });
        expect(result).toEqual({
            ok: false,
            problems: ["ANTHROPIC_API_KEY is missing", "RESEND_API_KEY is missing"],
        });
    });

    it("explains malformed values without including them", () => {
        const result = checkEnv({
            ...valid,
            APP_URL: "example.com",
            APP_TIMEZONE: "Eastern",
            CLERK_SECRET_KEY: "pk_live_swapped",
        });
        expect(result).toEqual({
            ok: false,
            problems: [
                "CLERK_SECRET_KEY isn't a Clerk secret key",
                "APP_URL isn't an http(s) URL",
                "APP_TIMEZONE isn't an IANA time zone like America/New_York",
            ],
        });
        expect(JSON.stringify(result)).not.toContain("pk_live_swapped");
    });

    it("treats the Sentry DSN as optional, but checks it when set", () => {
        expect(checkEnv({ ...valid, NEXT_PUBLIC_SENTRY_DSN: "https://key@o1.ingest.sentry.io/2" })).toEqual({
            ok: true,
        });
        expect(checkEnv({ ...valid, NEXT_PUBLIC_SENTRY_DSN: "key@o1.ingest.sentry.io/2" })).toEqual({
            ok: false,
            problems: ["NEXT_PUBLIC_SENTRY_DSN isn't a Sentry DSN (https://…)"],
        });
    });

    it("needs somewhere to store photos", () => {
        expect(checkEnv({ ...valid, BLOB_STORE_ID: undefined })).toEqual({
            ok: false,
            problems: ["BLOB_STORE_ID is missing (or set BLOB_READ_WRITE_TOKEN), so photos can't be stored"],
        });
    });
});
