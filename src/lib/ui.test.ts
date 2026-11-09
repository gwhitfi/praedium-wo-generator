import { describe, expect, it } from "vitest";
import { buttonClass, headingId } from "./ui";

describe("headingId", () => {
    it("drops the section number and keeps letters and digits", () => {
        expect(headingId("4. Your content")).toBe("your-content");
        expect(headingId("Who we share it with (and why)")).toBe("who-we-share-it-with-and-why");
        expect(headingId("12. AI & Praedium Bot")).toBe("ai-praedium-bot");
    });
});

describe("buttonClass", () => {
    it("combines the variant, size and extra classes", () => {
        const classes = buttonClass({ variant: "danger-outline", size: "sm", className: "w-full" });
        expect(classes).toContain("text-danger");
        expect(classes).toContain("h-10");
        expect(classes).toContain("w-full");
    });

    it("defaults to a medium secondary button", () => {
        expect(buttonClass()).toContain("border-line-strong");
    });
});
