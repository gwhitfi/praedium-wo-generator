import { describe, expect, it } from "vitest";
import { matchesSearch, MAX_QUERY_LENGTH, readQuery } from "./search";

describe("readQuery", () => {
    it("trims the value and takes the first of repeated params", () => {
        expect(readQuery("  roof  ")).toBe("roof");
        expect(readQuery(["leak", "roof"])).toBe("leak");
        expect(readQuery(undefined)).toBe("");
    });

    it("caps long queries", () => {
        expect(readQuery("x".repeat(500))).toHaveLength(MAX_QUERY_LENGTH);
    });
});

describe("matchesSearch", () => {
    const fields = ["Water heater replacement", "1420 Oak Ridge Dr", "Marcus Hill", "2026-1028"];

    it("matches everything for an empty query", () => {
        expect(matchesSearch("   ", fields)).toBe(true);
    });

    it("needs every word, in any field and any order, ignoring case", () => {
        expect(matchesSearch("oak heater", fields)).toBe(true);
        expect(matchesSearch("MARCUS", fields)).toBe(true);
        expect(matchesSearch("oak roof", fields)).toBe(false);
    });

    it("ignores punctuation and accents", () => {
        expect(matchesSearch("oak-ridge", fields)).toBe(true);
        expect(matchesSearch("café", ["Cafe on Main"])).toBe(true);
    });

    it("matches digits across punctuation, for phone and job numbers", () => {
        expect(matchesSearch("20261028", fields)).toBe(true);
        expect(matchesSearch("5550100", ["(864) 555-0100"])).toBe(true);
    });

    it("skips empty fields", () => {
        expect(matchesSearch("hill", [null, undefined, "Marcus Hill"])).toBe(true);
    });
});
