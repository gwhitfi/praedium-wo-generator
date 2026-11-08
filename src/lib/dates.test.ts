import { afterEach, describe, expect, it, vi } from "vitest";
import { formatDueDate, formatFullDate, formatFullTimestamp, formatTimestamp, todayInAppTimeZone } from "./dates";

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

describe("formatFullTimestamp", () => {
    it("writes the long date and time in APP_TIMEZONE, with no space before AM/PM", () => {
        vi.stubEnv("APP_TIMEZONE", "America/New_York");
        expect(formatFullTimestamp(new Date("2026-10-26T16:22:00Z"))).toBe("October 26, 2026 12:22PM");
        expect(formatFullTimestamp(new Date("2026-11-07T04:05:00Z"))).toBe("November 6, 2026 11:05PM");
    });
});

describe("formatFullDate", () => {
    it("writes a stored date-only value as a long date, whatever APP_TIMEZONE is", () => {
        vi.stubEnv("APP_TIMEZONE", "America/Los_Angeles");
        expect(formatFullDate(new Date("2026-11-05T00:00:00Z"))).toBe("November 5, 2026");
    });
});

describe("appTimeZone", () => {
    it("falls back to UTC and warns once when APP_TIMEZONE is not set", async () => {
        vi.stubEnv("APP_TIMEZONE", undefined);
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

        // Fresh copy of the module, so its "already warned" flag starts unset.
        vi.resetModules();
        const { appTimeZone } = await import("./dates");

        expect(appTimeZone()).toBe("UTC");
        expect(appTimeZone()).toBe("UTC");
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it("uses APP_TIMEZONE when set", async () => {
        vi.stubEnv("APP_TIMEZONE", "America/New_York");
        const { appTimeZone } = await import("./dates");

        expect(appTimeZone()).toBe("America/New_York");
    });
});

describe("todayInAppTimeZone", () => {
    it("returns the current date in the app time zone, as UTC midnight", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-10-02T02:00:00Z"));

        vi.stubEnv("APP_TIMEZONE", "America/New_York");
        expect(todayInAppTimeZone()).toEqual(new Date("2026-10-01"));

        vi.stubEnv("APP_TIMEZONE", "UTC");
        expect(todayInAppTimeZone()).toEqual(new Date("2026-10-02"));
    });
});

describe("formatDueDate", () => {
    it("shows the stored date regardless of the app time zone", () => {
        vi.stubEnv("APP_TIMEZONE", "Pacific/Honolulu");
        expect(formatDueDate(new Date("2026-10-02"))).toBe("Oct 2, 2026");
    });

    it("adds the weekday when asked", () => {
        expect(formatDueDate(new Date("2026-10-02"), { weekday: true })).toBe("Fri, Oct 2, 2026");
    });
});

describe("formatTimestamp", () => {
    it("formats the date in the app time zone", () => {
        const lateEvening = new Date("2026-10-02T02:00:00Z");

        vi.stubEnv("APP_TIMEZONE", "America/New_York");
        expect(formatTimestamp(lateEvening)).toBe("Oct 1, 2026");

        vi.stubEnv("APP_TIMEZONE", "UTC");
        expect(formatTimestamp(lateEvening)).toBe("Oct 2, 2026");
    });
});
