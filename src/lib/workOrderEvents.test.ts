import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
    default: {
        workOrderEvent: { create: vi.fn(), createMany: vi.fn() },
    },
}));

import prisma from "@/lib/prisma";
import {
    eventData,
    eventDayKey,
    isLikelyBot,
    logDailyOpen,
    logEvent,
    logEvents,
    NOTE_MAX_LENGTH,
    officeActorName,
} from "./workOrderEvents";

const user = { id: "user1", firstName: "Justin", lastName: "whitfield", email: "justin@example.com" };
const ids = { workOrderId: "wo1", organizationId: "org1" };

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
    vi.unstubAllEnvs();
});

describe("officeActorName", () => {
    it("uses the first name and last initial", () => {
        expect(officeActorName(user)).toBe("Justin W.");
    });

    it("falls back to whichever name there is, then the email", () => {
        expect(officeActorName({ ...user, lastName: null })).toBe("Justin");
        expect(officeActorName({ ...user, firstName: " ", lastName: "Whitfield" })).toBe("Whitfield");
        expect(officeActorName({ ...user, firstName: null, lastName: null })).toBe("justin@example.com");
    });
});

describe("isLikelyBot", () => {
    it("lets real browsers through", () => {
        const iphone =
            "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) " +
            "Version/18.0 Mobile/15E148 Safari/604.1";
        const chrome =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
        expect(isLikelyBot(iphone)).toBe(false);
        expect(isLikelyBot(chrome)).toBe(false);
    });

    it("catches scanners, previews and crawlers", () => {
        expect(isLikelyBot("Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)")).toBe(true);
        expect(isLikelyBot("WhatsApp/2.23.20.0")).toBe(true);
        expect(isLikelyBot("facebookexternalhit/1.1")).toBe(true);
        expect(isLikelyBot("Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/140.0 Safari/537.36")).toBe(true);
    });

    it("treats a missing user agent as a bot", () => {
        expect(isLikelyBot(null)).toBe(true);
        expect(isLikelyBot(" ")).toBe(true);
    });
});

describe("eventDayKey", () => {
    // 11:30 PM on Oct 23 in New York is already Oct 24 in UTC.
    const lateEvening = new Date("2026-10-24T03:30:00Z");

    it("uses the day in APP_TIMEZONE, not UTC", () => {
        vi.stubEnv("APP_TIMEZONE", "America/New_York");
        expect(eventDayKey(lateEvening)).toBe("2026-10-23");
    });

    it("uses UTC when APP_TIMEZONE is UTC", () => {
        vi.stubEnv("APP_TIMEZONE", "UTC");
        expect(eventDayKey(lateEvening)).toBe("2026-10-24");
    });
});

describe("eventData", () => {
    it("records an office user by ID and short name", () => {
        expect(eventData({ ...ids, type: "CLOSED", actor: { kind: "office", user } })).toEqual({
            ...ids,
            type: "CLOSED",
            byContractor: false,
            actorUserId: "user1",
            actorName: "Justin W.",
        });
    });

    it("records the contractor by name only, with the detail", () => {
        const detail = { item: "Replace faucet", area: "Kitchen" };
        expect(
            eventData({ ...ids, type: "ITEM_CHECKED", actor: { kind: "contractor", name: " Marcus Hill " }, detail }),
        ).toEqual({
            ...ids,
            type: "ITEM_CHECKED",
            byContractor: true,
            actorUserId: null,
            actorName: "Marcus Hill",
            detail,
        });
    });

    it("saves a contractor with no name as null", () => {
        expect(eventData({ ...ids, type: "OPENED", actor: { kind: "contractor", name: null } }).actorName).toBeNull();
    });

    it("cuts long notes to the maximum length", () => {
        const data = eventData({
            ...ids,
            type: "NOTE_SAVED",
            actor: { kind: "contractor", name: "Marcus Hill" },
            detail: { item: "Re-caulk tub", area: "Bathroom", note: "x".repeat(NOTE_MAX_LENGTH + 50) },
        });
        expect(data.detail).toEqual({ item: "Re-caulk tub", area: "Bathroom", note: "x".repeat(NOTE_MAX_LENGTH) });
    });

    it("adds the dedupe key when given", () => {
        const data = eventData(
            { ...ids, type: "OPENED", actor: { kind: "contractor", name: null } },
            "opened:2026-10-23",
        );
        expect(data.dedupeKey).toBe("opened:2026-10-23");
    });
});

describe("logEvent", () => {
    const input = { ...ids, type: "REOPENED" as const, actor: { kind: "office" as const, user } };

    it("saves the event", async () => {
        await logEvent(input);
        expect(prisma.workOrderEvent.create).toHaveBeenCalledWith({ data: eventData(input) });
    });

    it("doesn't throw when saving fails", async () => {
        vi.mocked(prisma.workOrderEvent.create).mockRejectedValue(new Error("database down"));
        await expect(logEvent(input)).resolves.toBeUndefined();
        expect(console.error).toHaveBeenCalled();
    });
});

describe("logEvents", () => {
    const inputs = [
        { ...ids, type: "CLOSED" as const, actor: { kind: "office" as const, user } },
        { ...ids, type: "ARCHIVED" as const, actor: { kind: "office" as const, user } },
    ];

    it("saves all the events in one insert", async () => {
        await logEvents(inputs);
        expect(prisma.workOrderEvent.createMany).toHaveBeenCalledWith({
            data: inputs.map((input) => eventData(input)),
        });
    });

    it("does nothing with no events", async () => {
        await logEvents([]);
        expect(prisma.workOrderEvent.createMany).not.toHaveBeenCalled();
    });

    it("doesn't throw when saving fails", async () => {
        vi.mocked(prisma.workOrderEvent.createMany).mockRejectedValue(new Error("database down"));
        await expect(logEvents(inputs)).resolves.toBeUndefined();
        expect(console.error).toHaveBeenCalled();
    });
});

describe("logDailyOpen", () => {
    const input = { ...ids, contractorName: "Marcus Hill" };

    it("saves one open per day, skipping duplicates", async () => {
        vi.stubEnv("APP_TIMEZONE", "America/New_York");
        await logDailyOpen(input, new Date("2026-10-23T12:05:00Z"));
        expect(prisma.workOrderEvent.createMany).toHaveBeenCalledWith({
            data: [
                {
                    ...ids,
                    type: "OPENED",
                    byContractor: true,
                    actorUserId: null,
                    actorName: "Marcus Hill",
                    dedupeKey: "opened:2026-10-23",
                },
            ],
            skipDuplicates: true,
        });
    });

    it("doesn't throw when saving fails", async () => {
        vi.mocked(prisma.workOrderEvent.createMany).mockRejectedValue(new Error("database down"));
        await expect(logDailyOpen(input)).resolves.toBeUndefined();
        expect(console.error).toHaveBeenCalled();
    });
});
