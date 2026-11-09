import { describe, expect, it } from "vitest";
import { decodeSavedDescription, encodeSavedDescription, SAVED_DESCRIPTION_MAX_AGE_MS } from "./savedDescription";

const now = new Date("2026-11-09T12:00:00Z");

describe("saved Praedium Bot description", () => {
    it("round-trips the text with the time it was saved", () => {
        const savedAt = new Date("2026-11-08T09:30:00Z");
        expect(decodeSavedDescription(encodeSavedDescription("Unit 4B sink leak", savedAt), now)).toEqual({
            text: "Unit 4B sink leak",
            savedAt,
        });
    });

    it("drops text older than the limit", () => {
        const old = new Date(now.getTime() - SAVED_DESCRIPTION_MAX_AGE_MS - 1000);
        expect(decodeSavedDescription(encodeSavedDescription("old", old), now)).toBeNull();
    });

    it("keeps plain text saved by the earlier version, with no date", () => {
        expect(decodeSavedDescription("Roof leak at Pelham Court", now)).toEqual({
            text: "Roof leak at Pelham Court",
            savedAt: null,
        });
    });

    it("ignores nothing, blank text and JSON that isn't ours", () => {
        expect(decodeSavedDescription(null, now)).toBeNull();
        expect(decodeSavedDescription(encodeSavedDescription("   ", now), now)).toBeNull();
        expect(decodeSavedDescription('{"other":1}', now)).toEqual({ text: '{"other":1}', savedAt: null });
    });
});
