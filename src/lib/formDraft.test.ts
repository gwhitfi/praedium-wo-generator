import { describe, expect, it } from "vitest";
import { decodeFormDraft, encodeFormDraft, FORM_DRAFT_MAX_AGE_MS, savedWhen } from "./formDraft";

const now = new Date("2026-11-09T12:00:00Z");

describe("form drafts", () => {
    it("round-trips the values with the time they were saved", () => {
        const savedAt = new Date("2026-11-08T09:30:00Z");
        const raw = encodeFormDraft({ title: "Leak", notes: "" }, false, savedAt);
        expect(decodeFormDraft(raw, ["title"], now)).toEqual({
            values: { title: "Leak", notes: "" },
            savedAt,
            quiet: false,
        });
    });

    it("remembers a quiet draft (saved on the way to add a record)", () => {
        expect(decodeFormDraft(encodeFormDraft({ title: "Leak" }, true, now), ["title"], now)?.quiet).toBe(true);
    });

    it("drops a draft with nothing worth restoring", () => {
        const raw = encodeFormDraft({ title: "  ", propertyId: "p1" }, false, now);
        expect(decodeFormDraft(raw, ["title", "notes"], now)).toBeNull();
    });

    it("drops a draft older than the limit", () => {
        const old = new Date(now.getTime() - FORM_DRAFT_MAX_AGE_MS - 1000);
        expect(decodeFormDraft(encodeFormDraft({ title: "Leak" }, false, old), ["title"], now)).toBeNull();
    });

    it("ignores missing, malformed or wrongly shaped data", () => {
        expect(decodeFormDraft(null, ["title"], now)).toBeNull();
        expect(decodeFormDraft("{not json", ["title"], now)).toBeNull();
        expect(decodeFormDraft(JSON.stringify({ title: "Leak" }), ["title"], now)).toBeNull();
        expect(
            decodeFormDraft(JSON.stringify({ values: { title: "Leak" }, savedAt: "never" }), ["title"], now),
        ).toBeNull();
    });

    it("keeps only text values", () => {
        const raw = JSON.stringify({ values: { title: "Leak", count: 3 }, savedAt: now.toISOString() });
        expect(decodeFormDraft(raw, ["title"], now)?.values).toEqual({ title: "Leak" });
    });
});

describe("savedWhen", () => {
    it("says earlier today for the same day, a date otherwise", () => {
        expect(savedWhen(new Date(now.getTime() - 60_000), now)).toBe("earlier today");
        expect(savedWhen(new Date("2026-11-02T12:00:00Z"), now)).toMatch(/^on Nov [12]$/);
        expect(savedWhen(null, now)).toBe("earlier");
    });
});
