import { describe, expect, it } from "vitest";
import { filterOptions, starredFirst, type ComboOption } from "./options";

const options: ComboOption[] = [
    { value: "a", label: "Oak Ridge House", description: "1420 Oak Ridge Dr", keywords: ["Greenville"] },
    { value: "b", label: "Pelham Court", description: "1150 Pelham Rd", starred: true },
    { value: "c", label: "Hill Plumbing", description: "Marcus Hill", keywords: ["(864) 555-0102"] },
];

describe("filterOptions", () => {
    it("returns every option for a blank search", () => {
        expect(filterOptions(options, "  ")).toBe(options);
    });

    it("matches the label, description and keywords, keeping the order", () => {
        expect(filterOptions(options, "oak").map((o) => o.value)).toEqual(["a"]);
        expect(filterOptions(options, "pelham rd").map((o) => o.value)).toEqual(["b"]);
        expect(filterOptions(options, "greenville").map((o) => o.value)).toEqual(["a"]);
        expect(filterOptions(options, "hill").map((o) => o.value)).toEqual(["c"]);
    });

    it("matches phone digits across punctuation", () => {
        expect(filterOptions(options, "5550102").map((o) => o.value)).toEqual(["c"]);
    });

    it("returns nothing when no option matches", () => {
        expect(filterOptions(options, "roof")).toEqual([]);
    });
});

describe("starredFirst", () => {
    it("moves starred options to the top and keeps the rest in order", () => {
        expect(starredFirst(options).map((o) => o.value)).toEqual(["b", "a", "c"]);
    });
});
