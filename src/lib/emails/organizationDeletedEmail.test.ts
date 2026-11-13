import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { organizationDeletedEmail } from "./organizationDeletedEmail";
import { escapeHtml } from "./shared";

const base = {
    organizationName: "Acme Property",
    deletedBy: "Dana Reyes",
    deletedAt: new Date("2026-11-13T15:30:00Z"),
    restoreDeadline: new Date("2026-11-20T15:30:00Z"),
    setupUrl: "https://praedium.test/setup",
};

// Unique per field, so each assertion proves that particular field was escaped.
const hostile = (field: string) => `<b>${field}</b> "Tom" & 'Jerry'`;

beforeEach(() => {
    vi.stubEnv("APP_TIMEZONE", "America/New_York");
});

afterEach(() => {
    vi.unstubAllEnvs();
});

describe("organizationDeletedEmail", () => {
    it("names the organization and the deletion day in the subject", () => {
        expect(organizationDeletedEmail(base).subject).toBe("Acme Property will be deleted on November 20, 2026");
    });

    it("says who deleted it and when, that it's locked, and until when it can be restored", () => {
        const { text, html } = organizationDeletedEmail(base);

        expect(text).toContain("Dana Reyes deleted Acme Property in Praedium on November 13, 2026 10:30AM.");
        expect(text).toContain("It's locked for everyone now");
        expect(text).toContain("After November 20, 2026 10:30AM, every property");
        expect(text).toContain("sign in at https://praedium.test/setup and choose Restore.");
        expect(html).toContain('href="https://praedium.test/setup"');
        expect(html).toContain("November 20, 2026 10:30AM");
    });

    it("uses the app's time zone for the day", () => {
        vi.stubEnv("APP_TIMEZONE", "Pacific/Auckland");
        // 15:30 UTC is already the next day in New Zealand.
        expect(organizationDeletedEmail(base).subject).toBe("Acme Property will be deleted on November 21, 2026");
    });

    it("escapes user content in the HTML and leaves the text version as-is", () => {
        const fields = { organizationName: hostile("org"), deletedBy: hostile("person") };
        const email = organizationDeletedEmail({ ...base, ...fields });

        for (const value of Object.values(fields)) {
            expect(email.html).not.toContain(value);
            expect(email.html).toContain(escapeHtml(value));
            expect(email.text).toContain(value);
        }
        expect(email.html).not.toContain("<b>");
    });

    it("carries no restore token or other secret in the link", () => {
        const { html, text } = organizationDeletedEmail(base);
        const links = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
        expect(links).toEqual(["https://praedium.test/setup"]);
        expect(text).not.toMatch(/setup\?|token/i);
    });
});
