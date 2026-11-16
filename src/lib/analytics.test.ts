import { describe, expect, it } from "vitest";
import { cleanAnalyticsUrl } from "./analytics";

const token = "OUFDh3kq9zXy2ZcBbLmNoPqRsTuVwX01";

describe("cleanAnalyticsUrl", () => {
    it("replaces a contractor link's token, on every page under it", () => {
        expect(cleanAnalyticsUrl(`https://www.workorderfox.com/wo/${token}`)).toBe(
            "https://www.workorderfox.com/wo/[token]",
        );
        expect(cleanAnalyticsUrl(`https://www.workorderfox.com/wo/${token}/list`)).toBe(
            "https://www.workorderfox.com/wo/[token]/list",
        );
    });

    it("drops the verification code and every other query string or fragment", () => {
        expect(cleanAnalyticsUrl(`https://www.workorderfox.com/wo/${token}/verify?c=ch1.123456`)).toBe(
            "https://www.workorderfox.com/wo/[token]/verify",
        );
        expect(cleanAnalyticsUrl("https://www.workorderfox.com/work-orders?status=SENT&sort=due#top")).toBe(
            "https://www.workorderfox.com/work-orders",
        );
    });

    it("leaves ordinary pages alone", () => {
        expect(cleanAnalyticsUrl("https://www.workorderfox.com/properties/cm1abc")).toBe(
            "https://www.workorderfox.com/properties/cm1abc",
        );
    });

    it("handles a bare path", () => {
        expect(cleanAnalyticsUrl(`/wo/${token}?c=x`)).toBe("/wo/[token]");
    });
});
