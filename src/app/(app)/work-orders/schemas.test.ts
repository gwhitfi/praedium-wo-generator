import { describe, expect, it } from "vitest";
import { z } from "zod";
import { IN_HOUSE } from "@/lib/defaults";
import {
    firstItemInput,
    readFirstItemFormData,
    readWorkOrderFormData,
    submittedValues,
    workOrderFormInput,
} from "./schemas";

describe("firstItemInput", () => {
    const parse = (values: Record<string, string>) => {
        const data = new FormData();
        for (const [name, value] of Object.entries(values)) data.set(name, value);
        return firstItemInput.safeParse(readFirstItemFormData(data));
    };

    it("is null when nothing is filled in", () => {
        expect(parse({ firstArea: " ", firstItem: "" }).data).toBeNull();
    });

    it("puts an item with no area name in General, defaulting to Medium priority", () => {
        expect(parse({ firstItem: "Fix the faucet", firstPriority: "nonsense" }).data).toEqual({
            areaName: "General",
            item: { description: "Fix the faucet", priority: "MEDIUM" },
        });
    });

    it("keeps an area name alone as an empty area", () => {
        expect(parse({ firstArea: "Kitchen" }).data).toEqual({ areaName: "Kitchen", item: null });
    });

    it("rejects an over-long item", () => {
        expect(parse({ firstItem: "x".repeat(1001) }).success).toBe(false);
    });
});

function form(values: Record<string, string>) {
    const data = new FormData();
    for (const [name, value] of Object.entries(values)) data.set(name, value);
    return data;
}

describe("workOrderFormInput", () => {
    it("trims text and turns blanks into null", () => {
        const parsed = workOrderFormInput.parse(
            readWorkOrderFormData(form({ title: "  Fix sink ", propertyId: "prop1", unitId: "", notes: "  " })),
        );
        expect(parsed).toEqual({
            title: "Fix sink",
            propertyId: "prop1",
            unitId: null,
            contractorId: null,
            notes: null,
            dueDate: null,
            notifyTenant: false,
            inHouse: false,
        });
    });

    it("needs a title", () => {
        const result = workOrderFormInput.safeParse(readWorkOrderFormData(form({ title: "   " })));
        expect(result.success).toBe(false);
        expect(z.flattenError(result.error!).fieldErrors.title).toEqual(["Enter a title"]);
    });

    it("caps the title length", () => {
        const result = workOrderFormInput.safeParse(readWorkOrderFormData(form({ title: "x".repeat(201) })));
        expect(z.flattenError(result.error!).fieldErrors.title).toEqual(["Use 200 characters or fewer"]);
    });

    it("reads the due date as a date and refuses anything else", () => {
        const parsed = workOrderFormInput.parse(readWorkOrderFormData(form({ title: "x", dueDate: "2026-11-20" })));
        expect(parsed.dueDate).toEqual(new Date("2026-11-20"));

        const result = workOrderFormInput.safeParse(readWorkOrderFormData(form({ title: "x", dueDate: "11/20/26" })));
        expect(result.success).toBe(false);
        expect(z.flattenError(result.error!).fieldErrors.dueDate).toBeDefined();
    });

    it("turns the in-house choice into inHouse with no contractor", () => {
        const parsed = workOrderFormInput.parse(readWorkOrderFormData(form({ title: "x", contractorId: IN_HOUSE })));
        expect(parsed).toMatchObject({ inHouse: true, contractorId: null });

        const contractor = workOrderFormInput.parse(readWorkOrderFormData(form({ title: "x", contractorId: "c1" })));
        expect(contractor).toMatchObject({ inHouse: false, contractorId: "c1" });
    });

    it("reads the tenant checkbox", () => {
        expect(workOrderFormInput.parse(readWorkOrderFormData(form({ title: "x", tenant: "on" }))).notifyTenant).toBe(
            true,
        );
    });
});

describe("submittedValues", () => {
    it("keeps the text fields and drops React's action fields", () => {
        const data = form({ title: "Fix sink", $ACTION_ID_abc: "", notes: "Key in lockbox" });
        expect(submittedValues(data)).toEqual({ title: "Fix sink", notes: "Key in lockbox" });
    });
});
