import { describe, expect, it } from "vitest";
import { aiPreferenceInput, organizationInput } from "./schemas";

describe("aiPreferenceInput", () => {
    it("turns on and off into a boolean", () => {
        expect(aiPreferenceInput.parse({ aiEnabled: "on" })).toEqual({ aiEnabled: true });
        expect(aiPreferenceInput.parse({ aiEnabled: "off" })).toEqual({ aiEnabled: false });
    });

    it("rejects anything else", () => {
        expect(aiPreferenceInput.safeParse({ aiEnabled: "true" }).success).toBe(false);
        expect(aiPreferenceInput.safeParse({}).success).toBe(false);
    });
});

const organization = { name: "Acme Property", phone: "864-555-0100", email: "office@acme.test" };

describe("organizationInput", () => {
    it("accepts a full organization and normalizes the phone", () => {
        expect(organizationInput.parse(organization)).toEqual({
            name: "Acme Property",
            phone: "8645550100",
            email: "office@acme.test",
        });
    });

    it("accepts a name with no phone or email", () => {
        expect(organizationInput.parse({ name: "Acme Property", phone: "", email: "" })).toEqual({
            name: "Acme Property",
            phone: null,
            email: null,
        });
    });

    it("trims the name and rejects a blank or over-long one", () => {
        expect(organizationInput.parse({ ...organization, name: "  Acme  " }).name).toBe("Acme");
        expect(organizationInput.safeParse({ ...organization, name: "   " }).success).toBe(false);
        expect(organizationInput.safeParse({ ...organization, name: "x".repeat(101) }).success).toBe(false);
    });

    it("rejects a malformed phone or email", () => {
        expect(organizationInput.safeParse({ ...organization, phone: "555-0100" }).success).toBe(false);
        expect(organizationInput.safeParse({ ...organization, email: "office@" }).success).toBe(false);
    });
});
