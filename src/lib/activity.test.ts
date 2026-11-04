import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkOrderEventType } from "@/generated/prisma/client";
import { describeEvent, formatEventTime } from "./activity";

type Detail = Parameters<typeof describeEvent>[0]["detail"];

const office = (type: WorkOrderEventType, detail: Detail = null) =>
    describeEvent({ type, detail, actorName: "Justin W.", byContractor: false });
const contractor = (type: WorkOrderEventType, detail: Detail = null) =>
    describeEvent({ type, detail, actorName: "Marcus Hill", byContractor: true });

const faucet = { item: "Replace faucet", area: "Kitchen" };

afterEach(() => {
    vi.unstubAllEnvs();
});

describe("describeEvent: office", () => {
    it.each<[WorkOrderEventType, Detail, string]>([
        ["CREATED", { source: "form" }, "Justin W. created the work order"],
        ["CREATED", { source: "bot" }, "Justin W. created the work order with Praedium Bot"],
        ["CREATED", { source: "mcp" }, "Justin W. created the work order through the API"],
        ["SENT", { deliveryMethod: "EMAIL", resent: false }, "Justin W. sent it by email"],
        ["SENT", { deliveryMethod: "EMAIL", resent: true }, "Justin W. re-sent it by email"],
        ["SENT", { deliveryMethod: "PRINT", resent: false }, "Justin W. marked it sent (printed)"],
        ["SENT", { deliveryMethod: "SMS", resent: false }, "Justin W. marked it sent (by text)"],
        [
            "SENT",
            { deliveryMethod: "EMAIL", resent: false, tenantNotified: true },
            "Justin W. sent it by email and emailed the tenant",
        ],
        [
            "SENT",
            { deliveryMethod: "PRINT", resent: false, tenantNotified: true },
            "Justin W. marked it sent (printed) and emailed the tenant",
        ],
        ["EDITED", { fields: ["title"] }, "Justin W. edited the title"],
        ["EDITED", { fields: ["title", "notes", "dueDate"] }, "Justin W. edited the title, notes and due date"],
        ["EDITED", { fields: ["link"] }, "Justin W. made a new contractor link"],
        [
            "CONTRACTOR_CHANGED",
            { from: "Joe's Plumbing", to: "Ana's Electric" },
            "Justin W. changed the contractor from Joe's Plumbing to Ana's Electric",
        ],
        ["CONTRACTOR_CHANGED", { from: null, to: "Ana's Electric" }, "Justin W. assigned Ana's Electric"],
        [
            "CONTRACTOR_CHANGED",
            { from: "Joe's Plumbing", to: null },
            "Justin W. removed Joe's Plumbing as the contractor",
        ],
        ["COMPLETED_BY_OFFICE", null, "Justin W. marked it complete"],
        ["REOPENED", null, "Justin W. reopened it"],
        ["CLOSED", null, "Justin W. closed it"],
        ["ARCHIVED", null, "Justin W. archived it"],
        ["RESTORED", null, "Justin W. restored it"],
        ["PHOTO_ADDED", faucet, 'Justin W. added a photo to "Replace faucet" (Kitchen)'],
        ["PHOTO_REMOVED", faucet, 'Justin W. removed the photo from "Replace faucet" (Kitchen)'],
        ["ITEM_ADDED", faucet, 'Justin W. added "Replace faucet" (Kitchen)'],
        ["ITEM_REMOVED", faucet, 'Justin W. removed "Replace faucet" (Kitchen)'],
        [
            "ITEM_EDITED",
            { ...faucet, from: "Fix faucet" },
            'Justin W. renamed "Fix faucet" to "Replace faucet" (Kitchen)',
        ],
        [
            "ITEM_EDITED",
            { ...faucet, priority: { from: "MEDIUM", to: "HIGH" } },
            'Justin W. changed the priority from Medium to High on "Replace faucet" (Kitchen)',
        ],
        [
            "ITEM_EDITED",
            { ...faucet, from: "Fix faucet", priority: { from: "MEDIUM", to: "HIGH" } },
            'Justin W. renamed "Fix faucet" to "Replace faucet" (Kitchen) and changed its priority from Medium to High',
        ],
        ["AREA_ADDED", { area: "Yard" }, 'Justin W. added the area "Yard"'],
        ["AREA_REMOVED", { area: "Yard" }, 'Justin W. removed the area "Yard"'],
    ])("%s %j", (type, detail, text) => {
        expect(office(type, detail)).toEqual({ text, backfilled: false });
    });

    it("shows a cancel reason as a note", () => {
        expect(office("CANCELLED", { reason: "Archived" })).toEqual({
            text: "Justin W. cancelled it",
            note: "Archived",
            backfilled: false,
        });
        expect(office("CANCELLED", { reason: null })).toEqual({ text: "Justin W. cancelled it", backfilled: false });
    });
});

describe("describeEvent: contractor", () => {
    it.each<[WorkOrderEventType, Detail, string]>([
        ["OPENED", null, "Marcus Hill opened the work order"],
        ["ITEM_CHECKED", faucet, 'Marcus Hill checked off "Replace faucet" (Kitchen)'],
        ["ITEM_UNCHECKED", faucet, 'Marcus Hill unchecked "Replace faucet" (Kitchen)'],
        ["NOTE_SAVED", { ...faucet, note: "" }, 'Marcus Hill cleared the note on "Replace faucet" (Kitchen)'],
    ])("%s %j", (type, detail, text) => {
        expect(contractor(type, detail)).toEqual({ text, backfilled: false });
    });

    it("shows notes under the line", () => {
        expect(contractor("NOTE_SAVED", { ...faucet, note: "Valve is seized" })).toEqual({
            text: 'Marcus Hill added a note to "Replace faucet" (Kitchen)',
            note: "Valve is seized",
            backfilled: false,
        });
        expect(contractor("COMPLETED_BY_CONTRACTOR", { notes: "All done" })).toEqual({
            text: "Marcus Hill marked the work complete",
            note: "All done",
            backfilled: false,
        });
    });

    it("falls back to 'The contractor' or 'The office' without a name", () => {
        expect(describeEvent({ type: "OPENED", detail: null, actorName: null, byContractor: true }).text).toBe(
            "The contractor opened the work order",
        );
        expect(describeEvent({ type: "CLOSED", detail: null, actorName: null, byContractor: false }).text).toBe(
            "The office closed it",
        );
    });
});

describe("describeEvent: backfilled rows", () => {
    const backfilled = (type: WorkOrderEventType, detail: Record<string, unknown>, actorName: string | null = null) =>
        describeEvent({ type, detail: { backfilled: true, ...detail } as Detail, actorName, byContractor: false });

    it("reads without an actor", () => {
        expect(backfilled("CREATED", {})).toEqual({ text: "Work order created", backfilled: true });
        expect(backfilled("SENT", { deliveryMethod: "EMAIL" })).toEqual({ text: "Sent by email", backfilled: true });
        expect(backfilled("SENT", {})).toEqual({ text: "Sent to the contractor", backfilled: true });
        expect(backfilled("COMPLETED_BY_CONTRACTOR", {})).toEqual({ text: "Marked complete", backfilled: true });
        expect(backfilled("COMPLETED_BY_OFFICE", {})).toEqual({ text: "Marked complete", backfilled: true });
        expect(backfilled("CANCELLED", { reason: "Property archived" })).toEqual({
            text: "Cancelled",
            note: "Property archived",
            backfilled: true,
        });
    });

    it("uses the contractor's name on backfilled check-offs when there is one", () => {
        expect(backfilled("ITEM_CHECKED", faucet, "Marcus Hill").text).toBe(
            'Marcus Hill checked off "Replace faucet" (Kitchen)',
        );
        expect(backfilled("ITEM_CHECKED", faucet).text).toBe('Checked off "Replace faucet" (Kitchen)');
    });
});

describe("describeEvent: unreadable details", () => {
    it.each<[WorkOrderEventType, Detail]>([
        ["ITEM_CHECKED", null],
        ["ITEM_CHECKED", { item: 42 }],
        ["EDITED", { fields: [] }],
        ["NOTE_SAVED", "not an object"],
    ])("falls back to a plain label for %s %j", (type, detail) => {
        expect(office(type, detail).text).not.toContain("undefined");
        expect(office(type, detail)).toEqual({ text: expect.not.stringContaining("Justin"), backfilled: false });
    });
});

describe("formatEventTime", () => {
    const morning = new Date("2026-10-23T13:12:00Z");

    it("shows the date and time in APP_TIMEZONE", () => {
        vi.stubEnv("APP_TIMEZONE", "America/New_York");
        expect(formatEventTime(morning)).toBe("Oct 23, 2026 · 9:12 AM");
    });

    it("rolls the date over at midnight in APP_TIMEZONE, not UTC", () => {
        vi.stubEnv("APP_TIMEZONE", "America/New_York");
        expect(formatEventTime(new Date("2026-10-24T03:30:00Z"))).toBe("Oct 23, 2026 · 11:30 PM");
    });
});
