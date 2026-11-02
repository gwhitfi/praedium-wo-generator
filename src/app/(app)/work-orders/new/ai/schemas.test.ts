import { describe, expect, it } from "vitest";
import { confirmedDraft } from "./schemas";

const draft = {
    propertyId: "prop1",
    unitId: "unit1",
    contractorId: "contractor1",
    title: "Leak under kitchen sink",
    notes: null,
    dueDate: "2026-11-05",
    areas: [{ name: "Kitchen", lineItems: [{ description: "Replace P-trap", priority: "HIGH" }] }],
};

describe("confirmedDraft", () => {
    it("accepts a reviewed draft", () => {
        expect(confirmedDraft.parse(draft).propertyId).toBe("prop1");
    });

    it("allows the unit and contractor to be left empty", () => {
        const result = confirmedDraft.parse({ ...draft, unitId: null, contractorId: null });
        expect(result.unitId).toBeNull();
        expect(result.contractorId).toBeNull();
    });

    it("requires a property and a title", () => {
        expect(confirmedDraft.safeParse({ ...draft, propertyId: "" }).success).toBe(false);
        expect(confirmedDraft.safeParse({ ...draft, title: "  " }).success).toBe(false);
    });

    it("turns blank notes into null", () => {
        expect(confirmedDraft.parse({ ...draft, notes: " " }).notes).toBeNull();
    });

    it("rejects a draft with no areas", () => {
        expect(confirmedDraft.safeParse({ ...draft, areas: [] }).success).toBe(false);
    });
});
