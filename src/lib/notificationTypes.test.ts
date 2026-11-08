import { describe, expect, it } from "vitest";
import {
    DEFAULT_NOTIFICATION_TYPES,
    NO_NOTIFICATIONS,
    resolveNotificationTypes,
    storedNotificationTypes,
    timeAgo,
} from "./notificationTypes";

describe("resolveNotificationTypes", () => {
    it("uses the defaults when nothing is saved", () => {
        expect(resolveNotificationTypes([])).toEqual([
            "completed",
            "contractor_started",
            "contractor_opened",
            "overdue",
        ]);
        expect(DEFAULT_NOTIFICATION_TYPES).toEqual(resolveNotificationTypes([]));
    });

    it("keeps known options in a fixed order and drops unknown ones", () => {
        expect(resolveNotificationTypes(["overdue", "created", "retired_option"])).toEqual(["overdue", "created"]);
    });

    it("reads the all-off marker as nothing", () => {
        expect(resolveNotificationTypes([NO_NOTIFICATIONS])).toEqual([]);
    });
});

describe("storedNotificationTypes", () => {
    it("saves the choice, and the all-off marker for an empty one", () => {
        expect(storedNotificationTypes(["created", "completed"])).toEqual(["completed", "created"]);
        expect(storedNotificationTypes([])).toEqual([NO_NOTIFICATIONS]);
    });

    it("round-trips through resolveNotificationTypes", () => {
        for (const choice of [[], ["item_checked"], DEFAULT_NOTIFICATION_TYPES] as const) {
            expect(resolveNotificationTypes(storedNotificationTypes([...choice]))).toEqual([...choice]);
        }
    });
});

describe("timeAgo", () => {
    const now = new Date("2026-11-07T12:00:00Z");
    const ago = (ms: number) => timeAgo(new Date(now.getTime() - ms), now);

    it("counts minutes, hours and days", () => {
        expect(ago(20_000)).toBe("just now");
        expect(ago(5 * 60_000)).toBe("5m ago");
        expect(ago(3 * 3_600_000)).toBe("3h ago");
        expect(ago(2 * 86_400_000)).toBe("2d ago");
    });

    it("shows the date after a week", () => {
        expect(ago(30 * 86_400_000)).toMatch(/^Oct \d+$/);
        expect(ago(400 * 86_400_000)).toMatch(/2025$/);
    });
});
