import { describe, expect, it } from "vitest";
import { z } from "zod";
import { contactInput } from "./schemas";

const contractor = {
    contactType: "CONTRACTOR",
    displayName: "Bob's Plumbing",
    email: "bob@example.com",
    phone: "555-123-4567",
    // The form action always sets it from the checkbox.
    inHouse: false,
};

describe("contactInput", () => {
    it("accepts a contractor with only the required fields", () => {
        const result = contactInput.parse(contractor);
        expect(result.displayName).toBe("Bob's Plumbing");
        expect(result.company).toBeNull();
        expect(result.zipCode).toBeNull();
    });

    it("accepts a tenant with no address fields", () => {
        const result = contactInput.parse({ ...contractor, contactType: "TENANT", unitId: "unit123" });
        expect(result.addressLine1).toBeNull();
        expect(result.city).toBeNull();
        expect(result.unitId).toBe("unit123");
    });

    it("rejects an unknown contact type or blank name", () => {
        expect(contactInput.safeParse({ ...contractor, contactType: "LANDLORD" }).success).toBe(false);
        expect(contactInput.safeParse({ ...contractor, displayName: "   " }).success).toBe(false);
    });
});

describe("phone", () => {
    it("strips formatting down to 10 digits", () => {
        expect(contactInput.parse({ ...contractor, phone: "(555) 123-4567" }).phone).toBe("5551234567");
        expect(contactInput.parse({ ...contractor, phone: "555.123.4567" }).phone).toBe("5551234567");
    });

    it("drops a leading +1", () => {
        expect(contactInput.parse({ ...contractor, phone: "+1 555 123 4567" }).phone).toBe("5551234567");
    });

    it("rejects too few or too many digits", () => {
        expect(contactInput.safeParse({ ...contractor, phone: "123-4567" }).success).toBe(false);
        expect(contactInput.safeParse({ ...contractor, phone: "25551234567" }).success).toBe(false);
        expect(contactInput.safeParse({ ...contractor, phone: "" }).success).toBe(false);
    });
});

describe("email", () => {
    it("trims surrounding spaces", () => {
        expect(contactInput.parse({ ...contractor, email: "  bob@example.com " }).email).toBe("bob@example.com");
    });

    it("rejects a missing or malformed email", () => {
        expect(contactInput.safeParse({ ...contractor, email: "not-an-email" }).success).toBe(false);
        expect(contactInput.safeParse({ ...contractor, email: undefined }).success).toBe(false);
    });
});

describe("blank required fields", () => {
    it("explains what's missing instead of reporting a bad format", () => {
        const result = contactInput.safeParse({ ...contractor, displayName: "", phone: " ", email: "" });
        expect(z.flattenError(result.error!).fieldErrors).toEqual({
            displayName: ["Enter a name"],
            phone: ["Enter a phone number"],
            email: ["Enter an email"],
        });
    });
});

describe("length limits", () => {
    it("rejects an over-long name with a readable message", () => {
        const result = contactInput.safeParse({ ...contractor, firstName: "x".repeat(51) });
        expect(result.success).toBe(false);
        expect(result.error?.issues[0].message).toBe("Use 50 characters or fewer");
        expect(contactInput.parse({ ...contractor, firstName: "x".repeat(50) }).firstName).toHaveLength(50);
    });

    it("allows notes up to 5000 characters", () => {
        expect(contactInput.safeParse({ ...contractor, notes: "x".repeat(5000) }).success).toBe(true);
        expect(contactInput.safeParse({ ...contractor, notes: "x".repeat(5001) }).success).toBe(false);
    });
});

describe("state", () => {
    it("uppercases a valid state and rejects an unknown one", () => {
        expect(contactInput.parse({ ...contractor, state: "sc" }).state).toBe("SC");
        expect(contactInput.safeParse({ ...contractor, state: "ZZ" }).success).toBe(false);
    });
});

describe("zipCode", () => {
    it("accepts 5-digit and ZIP+4", () => {
        expect(contactInput.parse({ ...contractor, zipCode: "29631" }).zipCode).toBe("29631");
        expect(contactInput.parse({ ...contractor, zipCode: "29631-1234" }).zipCode).toBe("29631-1234");
    });

    it("turns an empty zip into null", () => {
        expect(contactInput.parse({ ...contractor, zipCode: "" }).zipCode).toBeNull();
    });

    it("rejects malformed zips", () => {
        expect(contactInput.safeParse({ ...contractor, zipCode: "2963" }).success).toBe(false);
        expect(contactInput.safeParse({ ...contractor, zipCode: "abcde" }).success).toBe(false);
    });
});
