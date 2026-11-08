import { describe, expect, it } from "vitest";
import {
    aiPreferenceInput,
    apiKeyNameInput,
    notificationPreferenceInput,
    organizationInput,
    revokeApiKeyInput,
} from "./schemas";

describe("notificationPreferenceInput", () => {
    it("accepts known options, including none", () => {
        expect(notificationPreferenceInput.parse({ types: ["completed", "overdue"] })).toEqual({
            types: ["completed", "overdue"],
        });
        expect(notificationPreferenceInput.parse({ types: [] })).toEqual({ types: [] });
    });

    it("rejects unknown options", () => {
        expect(notificationPreferenceInput.safeParse({ types: ["completed", "everything"] }).success).toBe(false);
        expect(notificationPreferenceInput.safeParse({ types: ["none"] }).success).toBe(false);
    });
});

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

describe("apiKeyNameInput", () => {
    it("trims the name and leaves the status permission off without the checkbox", () => {
        expect(apiKeyNameInput.parse({ name: "  Claude desktop  " })).toEqual({
            name: "Claude desktop",
            canChangeStatus: false,
        });
    });

    it("turns the ticked checkbox into true and rejects other values", () => {
        expect(apiKeyNameInput.parse({ name: "Bot", canChangeStatus: "on" }).canChangeStatus).toBe(true);
        expect(apiKeyNameInput.safeParse({ name: "Bot", canChangeStatus: "yes" }).success).toBe(false);
    });

    it("rejects a missing, blank or over-long name", () => {
        expect(apiKeyNameInput.safeParse({}).success).toBe(false);
        expect(apiKeyNameInput.safeParse({ name: "   " }).success).toBe(false);
        expect(apiKeyNameInput.safeParse({ name: "x".repeat(61) }).success).toBe(false);
    });
});

describe("revokeApiKeyInput", () => {
    it("requires an id", () => {
        expect(revokeApiKeyInput.parse({ id: "key1" })).toEqual({ id: "key1" });
        expect(revokeApiKeyInput.safeParse({ id: "" }).success).toBe(false);
        expect(revokeApiKeyInput.safeParse({}).success).toBe(false);
    });
});
