import { afterEach, describe, expect, it, vi } from "vitest";
import { formatFrom, getAppUrl } from "./email";

afterEach(() => {
    vi.unstubAllEnvs();
});

describe("getAppUrl", () => {
    it("strips trailing slashes", () => {
        vi.stubEnv("APP_URL", "https://workorder.dev/");
        expect(getAppUrl()).toBe("https://workorder.dev");

        vi.stubEnv("APP_URL", "https://workorder.dev///");
        expect(getAppUrl()).toBe("https://workorder.dev");
    });

    it("returns a URL without a trailing slash unchanged", () => {
        vi.stubEnv("APP_URL", "http://localhost:3000");
        expect(getAppUrl()).toBe("http://localhost:3000");
    });

    it("throws when APP_URL is missing", () => {
        vi.stubEnv("APP_URL", undefined);
        expect(() => getAppUrl()).toThrow("APP_URL is missing");
    });
});

describe("formatFrom", () => {
    const from = "notifications@workorder.dev";

    it("uses Work Order Fox as the default sender name", () => {
        expect(formatFrom(from)).toBe(`"Work Order Fox" <${from}>`);
        expect(formatFrom(from, null)).toBe(`"Work Order Fox" <${from}>`);
        expect(formatFrom(from, "")).toBe(`"Work Order Fox" <${from}>`);
    });

    it("adds the name as the display name", () => {
        expect(formatFrom(from, "Acme Property")).toBe(
            '"Acme Property via Work Order Fox" <notifications@workorder.dev>',
        );
    });

    it("keeps only the address when EMAIL_FROM already has a display name", () => {
        expect(formatFrom("Onboarding <onboarding@resend.dev>", "Acme")).toBe(
            '"Acme via Work Order Fox" <onboarding@resend.dev>',
        );
    });

    it("removes quotes, backslashes and angle brackets from the name", () => {
        expect(formatFrom(from, 'Bob "The Plumber" <evil@x.com> \\')).toBe(
            '"Bob The Plumber evil@x.com  via Work Order Fox" <notifications@workorder.dev>',
        );
    });

    it("removes line breaks, so the name can't add email headers", () => {
        expect(formatFrom(from, "Acme\r\nBcc: victim@example.com")).toBe(
            '"AcmeBcc: victim@example.com via Work Order Fox" <notifications@workorder.dev>',
        );
    });
});
