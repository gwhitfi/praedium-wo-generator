import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    findNeighbors,
    formatWorkOrderAddress,
    isOverdue,
    isWorkOrderFilter,
    listQuery,
    orderForView,
    WORK_ORDER_SORTS,
} from "./workOrders";
import { sortRows } from "./sorting";

describe("orderForView", () => {
    const base = {
        jobNumber: "2026-1001",
        dueDate: null,
        contractorName: null,
        property: { addressLine1: "12 Oak St" },
        unit: null,
    };
    // In query order (newest first).
    const rows = [
        { ...base, id: "a", title: "Paint", status: "SENT" as const },
        { ...base, id: "b", title: "Roof", status: "DRAFT" as const },
        { ...base, id: "c", title: "Deck", status: "SENT" as const },
        { ...base, id: "d", title: "Gutters", status: "DRAFT" as const },
    ];
    const ids = (list: { id: string }[]) => list.map((row) => row.id);

    it("keeps the query order without a sort or split", () => {
        expect(ids(orderForView(rows, { sort: null, split: false }))).toEqual(["a", "b", "c", "d"]);
    });

    it("sorts the whole list when not split", () => {
        expect(ids(orderForView(rows, { sort: { key: "title", dir: "asc" }, split: false }))).toEqual([
            "c",
            "d",
            "a",
            "b",
        ]);
    });

    it("groups by status in workflow order (drafts first), sorting within each group", () => {
        expect(ids(orderForView(rows, { sort: null, split: true }))).toEqual(["b", "d", "a", "c"]);
        expect(ids(orderForView(rows, { sort: { key: "title", dir: "asc" }, split: true }))).toEqual([
            "d",
            "b",
            "c",
            "a",
        ]);
    });
});

describe("listQuery", () => {
    it("is empty for the default view", () => {
        expect(listQuery({ filter: null, sort: null })).toBe("");
    });

    it("includes the filter and sort", () => {
        expect(listQuery({ filter: "overdue", sort: null })).toBe("?status=overdue");
        expect(listQuery({ filter: "overdue", sort: { key: "due", dir: "desc" } })).toBe(
            "?status=overdue&sort=due&dir=desc",
        );
        expect(listQuery({ filter: null, sort: { key: "title", dir: "asc" } })).toBe("?sort=title&dir=asc");
        expect(listQuery({ filter: "draft", sort: null, query: "roof leak" })).toBe("?status=draft&q=roof+leak");
    });
});

describe("findNeighbors", () => {
    const ids = ["a", "b", "c"];

    it("finds the work orders on either side", () => {
        expect(findNeighbors(ids, "b")).toEqual({ position: 2, total: 3, previousId: "a", nextId: "c" });
    });

    it("has no previous on the first and no next on the last", () => {
        expect(findNeighbors(ids, "a")).toEqual({ position: 1, total: 3, previousId: null, nextId: "b" });
        expect(findNeighbors(ids, "c")).toEqual({ position: 3, total: 3, previousId: "b", nextId: null });
    });

    it("returns null when the work order isn't in the list", () => {
        expect(findNeighbors(ids, "z")).toBeNull();
    });
});

describe("WORK_ORDER_SORTS", () => {
    const workOrder = {
        jobNumber: "2026-1001",
        title: "Fix sink",
        status: "SENT" as const,
        dueDate: null,
        contractorName: "Marcus Hill",
        contractor: { firstName: "Marcus", lastName: "Hill" },
        property: { addressLine1: "12 Oak St" },
        unit: null,
    };

    it("sorts statuses in workflow order, not alphabetically", () => {
        const statuses = ["CANCELLED", "CLOSED", "COMPLETED", "DRAFT", "IN_PROGRESS", "SENT"] as const;
        const rows = statuses.map((status) => ({ ...workOrder, status }));
        const sorted = sortRows(rows, WORK_ORDER_SORTS, { key: "status", dir: "asc" });
        expect(sorted.map((row) => row.status)).toEqual([
            "DRAFT",
            "SENT",
            "IN_PROGRESS",
            "COMPLETED",
            "CLOSED",
            "CANCELLED",
        ]);
    });

    it("sorts job numbers by year, then by number value", () => {
        const numbers = ["2026-999", "2025-1500", "2026-1001"];
        const rows = numbers.map((jobNumber) => ({ ...workOrder, jobNumber }));
        const sorted = sortRows(rows, WORK_ORDER_SORTS, { key: "number", dir: "desc" });
        expect(sorted.map((row) => row.jobNumber)).toEqual(["2026-1001", "2026-999", "2025-1500"]);
    });

    it("sorts the property by street, number, then unit", () => {
        expect(WORK_ORDER_SORTS.property.value(workOrder)).toEqual(["Oak St", 12, null]);
        expect(WORK_ORDER_SORTS.property.value({ ...workOrder, unit: { name: "Main", isDefault: true } })).toEqual([
            "Oak St",
            12,
            null,
        ]);
        expect(WORK_ORDER_SORTS.property.value({ ...workOrder, unit: { name: "2B", isDefault: false } })).toEqual([
            "Oak St",
            12,
            "2B",
        ]);
    });

    it("sorts the contractor by last name, falling back to the name on the work order", () => {
        expect(WORK_ORDER_SORTS.contractor.value(workOrder)).toEqual(["Hill", "Marcus"]);
        expect(WORK_ORDER_SORTS.contractor.value({ ...workOrder, contractor: null })).toEqual(["Marcus Hill", null]);
        expect(
            WORK_ORDER_SORTS.contractor.value({
                ...workOrder,
                contractorName: "Acme Plumbing",
                contractor: { firstName: null, lastName: null },
            }),
        ).toEqual(["Acme Plumbing", null]);
    });
});

describe("formatWorkOrderAddress", () => {
    const property = { addressLine1: "12 Oak St", city: "Greenville", state: "SC", zipCode: "29601" };

    it("formats the address without a unit", () => {
        expect(formatWorkOrderAddress(property, null)).toBe("12 Oak St, Greenville, SC 29601");
    });

    it("leaves out the default unit", () => {
        expect(formatWorkOrderAddress(property, { name: "Main", isDefault: true })).toBe(
            "12 Oak St, Greenville, SC 29601",
        );
    });

    it("includes a named unit", () => {
        expect(formatWorkOrderAddress(property, { name: "2B", isDefault: false })).toBe(
            "12 Oak St, Unit 2B, Greenville, SC 29601",
        );
    });
});

describe("isWorkOrderFilter", () => {
    it("accepts every filter key", () => {
        for (const key of ["draft", "active", "completed", "overdue", "closed", "archived"]) {
            expect(isWorkOrderFilter(key)).toBe(true);
        }
    });

    it("rejects unknown keys and non-strings", () => {
        expect(isWorkOrderFilter("open")).toBe(false);
        expect(isWorkOrderFilter("")).toBe(false);
        expect(isWorkOrderFilter(undefined)).toBe(false);
        expect(isWorkOrderFilter(["draft"])).toBe(false);
    });

    it("rejects inherited object keys", () => {
        expect(isWorkOrderFilter("toString")).toBe(false);
        expect(isWorkOrderFilter("constructor")).toBe(false);
    });
});

describe("isOverdue", () => {
    const yesterday = new Date("2026-10-01");
    const today = new Date("2026-10-02");

    beforeEach(() => {
        vi.stubEnv("APP_TIMEZONE", "UTC");
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllEnvs();
    });

    it("is overdue when an open work order was due before today", () => {
        expect(isOverdue({ status: "DRAFT", dueDate: yesterday })).toBe(true);
        expect(isOverdue({ status: "SENT", dueDate: yesterday })).toBe(true);
        expect(isOverdue({ status: "IN_PROGRESS", dueDate: yesterday })).toBe(true);
    });

    it("is not overdue on the due date itself", () => {
        expect(isOverdue({ status: "SENT", dueDate: today })).toBe(false);
    });

    it("is never overdue once completed, closed or cancelled", () => {
        expect(isOverdue({ status: "COMPLETED", dueDate: yesterday })).toBe(false);
        expect(isOverdue({ status: "CLOSED", dueDate: yesterday })).toBe(false);
        expect(isOverdue({ status: "CANCELLED", dueDate: yesterday })).toBe(false);
    });

    it("is not overdue without a due date", () => {
        expect(isOverdue({ status: "SENT", dueDate: null })).toBe(false);
    });
});
