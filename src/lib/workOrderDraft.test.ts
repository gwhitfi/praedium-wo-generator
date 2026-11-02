import { describe, expect, it } from "vitest";
import { workOrderDraft } from "./workOrderDraft";

const draft = {
    propertyText: "123 Maple St",
    unitText: "4B",
    contractorText: "Joe's Plumbing",
    title: "Leak under kitchen sink",
    notes: "Tenant home after 3pm",
    dueDate: "2026-11-05",
    areas: [
        {
            name: "Kitchen",
            lineItems: [
                { description: "Replace P-trap under sink", priority: "HIGH" },
                { description: "Check cabinet floor for water damage", priority: "MEDIUM" },
            ],
        },
    ],
};

describe("workOrderDraft", () => {
    it("accepts a complete draft", () => {
        const result = workOrderDraft.parse(draft);
        expect(result.propertyText).toBe("123 Maple St");
        expect(result.areas[0].lineItems).toHaveLength(2);
    });

    it("trims text", () => {
        const result = workOrderDraft.parse({ ...draft, propertyText: "  123 Maple St ", title: " Leak " });
        expect(result.propertyText).toBe("123 Maple St");
        expect(result.title).toBe("Leak");
    });

    it("turns null or blank optional fields into null", () => {
        const result = workOrderDraft.parse({
            ...draft,
            unitText: " ",
            contractorText: null,
            notes: "",
            dueDate: null,
        });
        expect(result.unitText).toBeNull();
        expect(result.contractorText).toBeNull();
        expect(result.notes).toBeNull();
        expect(result.dueDate).toBeNull();
    });

    it("requires a property and a title", () => {
        expect(workOrderDraft.safeParse({ ...draft, propertyText: " " }).success).toBe(false);
        expect(workOrderDraft.safeParse({ ...draft, title: "" }).success).toBe(false);
    });

    it("rejects an unknown priority", () => {
        const areas = [{ name: "Kitchen", lineItems: [{ description: "Fix it", priority: "URGENT" }] }];
        expect(workOrderDraft.safeParse({ ...draft, areas }).success).toBe(false);
    });

    it("rejects a draft with no areas, or an area with no line items", () => {
        expect(workOrderDraft.safeParse({ ...draft, areas: [] }).success).toBe(false);
        expect(workOrderDraft.safeParse({ ...draft, areas: [{ name: "Kitchen", lineItems: [] }] }).success).toBe(false);
    });

    it("rejects a due date that isn't YYYY-MM-DD", () => {
        expect(workOrderDraft.safeParse({ ...draft, dueDate: "Friday" }).success).toBe(false);
        expect(workOrderDraft.safeParse({ ...draft, dueDate: "11/05/2026" }).success).toBe(false);
        expect(workOrderDraft.safeParse({ ...draft, dueDate: "2026-02-30" }).success).toBe(false);
    });

    it("rejects text over the length limit", () => {
        expect(workOrderDraft.safeParse({ ...draft, title: "a".repeat(201) }).success).toBe(false);
    });
});
