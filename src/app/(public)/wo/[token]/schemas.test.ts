import { describe, expect, it } from "vitest";
import {
    completeInput,
    magicLinkInput,
    noteInput,
    photoInput,
    sendCodeInput,
    toggleInput,
    verifyCodeInput,
} from "./schemas";

const token = "abc123";
const lineItemId = "cl0000000000000000000000";

describe("toggleInput", () => {
    it("accepts a token and line item ID", () => {
        expect(toggleInput.parse({ token, lineItemId })).toEqual({ token, lineItemId });
    });

    it("rejects an empty or over-long token", () => {
        expect(toggleInput.safeParse({ token: "", lineItemId }).success).toBe(false);
        expect(toggleInput.safeParse({ token: "x".repeat(101), lineItemId }).success).toBe(false);
    });

    it("rejects an empty or over-long line item ID", () => {
        expect(toggleInput.safeParse({ token, lineItemId: "" }).success).toBe(false);
        expect(toggleInput.safeParse({ token, lineItemId: "x".repeat(101) }).success).toBe(false);
    });

    it("rejects non-string values", () => {
        expect(toggleInput.safeParse({ token: 123, lineItemId }).success).toBe(false);
        expect(toggleInput.safeParse({ token, lineItemId: null }).success).toBe(false);
    });
});

describe("noteInput", () => {
    it("trims the note", () => {
        expect(noteInput.parse({ token, lineItemId, note: "  Replaced the valve  " }).note).toBe(
            "Replaced the valve",
        );
    });

    it("turns an empty or blank note into null", () => {
        expect(noteInput.parse({ token, lineItemId, note: "" }).note).toBeNull();
        expect(noteInput.parse({ token, lineItemId, note: "   \n " }).note).toBeNull();
    });

    it("accepts 2000 characters and rejects 2001", () => {
        expect(noteInput.parse({ token, lineItemId, note: "x".repeat(2000) }).note).toHaveLength(2000);
        expect(noteInput.safeParse({ token, lineItemId, note: "x".repeat(2001) }).success).toBe(false);
    });

    it("rejects a non-string note", () => {
        expect(noteInput.safeParse({ token, lineItemId, note: 42 }).success).toBe(false);
    });
});

describe("completeInput", () => {
    it("trims completion notes and turns blank ones into null", () => {
        expect(completeInput.parse({ token, completionNotes: " All done " }).completionNotes).toBe("All done");
        expect(completeInput.parse({ token, completionNotes: "  " }).completionNotes).toBeNull();
    });

    it("rejects completion notes over 2000 characters", () => {
        expect(completeInput.safeParse({ token, completionNotes: "x".repeat(2001) }).success).toBe(false);
    });
});

describe("photoInput", () => {
    it("accepts a token and attachment ID", () => {
        expect(photoInput.parse({ token, attachmentId: lineItemId })).toEqual({ token, attachmentId: lineItemId });
    });

    it("rejects an empty or over-long token or attachment ID", () => {
        expect(photoInput.safeParse({ token: "", attachmentId: lineItemId }).success).toBe(false);
        expect(photoInput.safeParse({ token, attachmentId: "" }).success).toBe(false);
        expect(photoInput.safeParse({ token, attachmentId: "x".repeat(101) }).success).toBe(false);
    });
});

describe("sendCodeInput", () => {
    it("accepts a token and rejects an empty one", () => {
        expect(sendCodeInput.parse({ token })).toEqual({ token });
        expect(sendCodeInput.safeParse({ token: "" }).success).toBe(false);
    });
});

describe("verifyCodeInput", () => {
    const valid = { token, challengeId: "ch1", code: "042917", remember: true };

    it("accepts six digits and trims spaces", () => {
        expect(verifyCodeInput.parse(valid)).toEqual(valid);
        expect(verifyCodeInput.parse({ ...valid, code: " 042917 " }).code).toBe("042917");
    });

    it("rejects five digits, seven digits and letters", () => {
        expect(verifyCodeInput.safeParse({ ...valid, code: "04291" }).success).toBe(false);
        expect(verifyCodeInput.safeParse({ ...valid, code: "0429171" }).success).toBe(false);
        expect(verifyCodeInput.safeParse({ ...valid, code: "04291a" }).success).toBe(false);
    });

    it("rejects a non-boolean remember and a missing challenge ID", () => {
        expect(verifyCodeInput.safeParse({ ...valid, remember: "true" }).success).toBe(false);
        expect(verifyCodeInput.safeParse({ ...valid, challengeId: "" }).success).toBe(false);
    });
});

describe("magicLinkInput", () => {
    it("splits the challenge ID and the code", () => {
        expect(magicLinkInput.parse("ch-1.042917")).toEqual({ challengeId: "ch-1", code: "042917" });
    });

    it("rejects a missing or malformed code or ID", () => {
        for (const value of ["ch1", "ch1.12345", ".042917", "ch1.04291a", `${"x".repeat(101)}.042917`, "a.b.042917"]) {
            expect(magicLinkInput.safeParse(value).success).toBe(false);
        }
    });
});
