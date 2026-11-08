import { describe, expect, it } from "vitest";
import { INBOX_MAX_ITEMS, loadMoreInput } from "./schemas";

describe("loadMoreInput", () => {
    it("reads the offset and turns the cut-off into a date", () => {
        expect(loadMoreInput.parse({ offset: 15, unreadAfter: "2026-11-05T15:00:00.000Z" })).toEqual({
            offset: 15,
            unreadAfter: new Date("2026-11-05T15:00:00.000Z"),
        });
    });

    it("rejects bad offsets and cut-offs", () => {
        const unreadAfter = "2026-11-05T15:00:00.000Z";
        for (const offset of [-1, 1.5, INBOX_MAX_ITEMS + 1]) {
            expect(loadMoreInput.safeParse({ offset, unreadAfter }).success).toBe(false);
        }
        expect(loadMoreInput.safeParse({ offset: 15, unreadAfter: "yesterday" }).success).toBe(false);
    });
});
