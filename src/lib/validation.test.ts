import { describe, expect, it } from "vitest";
import { optionalEmail, optionalPhone, optionalState, optionalZip, parseId, state, zip } from "./validation";

describe("parseId", () => {
    it("returns a plain string ID", () => {
        expect(parseId("cmh1abc23000008l4")).toBe("cmh1abc23000008l4");
    });

    it("returns null for anything Prisma could read as a filter, or an unusable string", () => {
        expect(parseId({ not: "" })).toBeNull();
        expect(parseId(["a"])).toBeNull();
        expect(parseId(123)).toBeNull();
        expect(parseId(null)).toBeNull();
        expect(parseId(undefined)).toBeNull();
        expect(parseId("")).toBeNull();
        expect(parseId("x".repeat(101))).toBeNull();
    });
});

describe("optionalPhone", () => {
    it("turns empty or missing into null", () => {
        expect(optionalPhone.parse("")).toBeNull();
        expect(optionalPhone.parse(undefined)).toBeNull();
    });

    it("strips formatting down to 10 digits", () => {
        expect(optionalPhone.parse("(555) 123-4567")).toBe("5551234567");
        expect(optionalPhone.parse("+1 555 123 4567")).toBe("5551234567");
    });

    it("rejects too few or too many digits with the phone message", () => {
        const result = optionalPhone.safeParse("123-4567");
        expect(result.success).toBe(false);
        expect(result.error?.issues[0].message).toBe("Enter a 10-digit phone number");
        expect(optionalPhone.safeParse("25551234567").success).toBe(false);
    });
});

describe("optionalEmail", () => {
    it("turns empty, blank or missing into null", () => {
        expect(optionalEmail.parse("")).toBeNull();
        expect(optionalEmail.parse("   ")).toBeNull();
        expect(optionalEmail.parse(undefined)).toBeNull();
    });

    it("trims a valid email", () => {
        expect(optionalEmail.parse("  office@example.com ")).toBe("office@example.com");
    });

    it("rejects a malformed email", () => {
        const result = optionalEmail.safeParse("not-an-email");
        expect(result.success).toBe(false);
        expect(result.error?.issues[0].message).toBe("Invalid email address");
    });
});

describe("optionalState", () => {
    it("turns empty, blank or missing into null", () => {
        expect(optionalState.parse("")).toBeNull();
        expect(optionalState.parse("  ")).toBeNull();
        expect(optionalState.parse(undefined)).toBeNull();
    });

    it("accepts a state code in any case", () => {
        expect(optionalState.parse("SC")).toBe("SC");
        expect(optionalState.parse(" sc ")).toBe("SC");
        expect(optionalState.parse("DC")).toBe("DC");
    });

    it("rejects anything that isn't a US state code", () => {
        const result = optionalState.safeParse("XX");
        expect(result.success).toBe(false);
        expect(result.error?.issues[0].message).toBe("Choose a US state");
        expect(optionalState.safeParse("1").success).toBe(false);
        expect(optionalState.safeParse("South Carolina").success).toBe(false);
    });
});

describe("state", () => {
    it("accepts a state code in any case", () => {
        expect(state.parse(" sc ")).toBe("SC");
    });

    it("reports only the blank message when empty", () => {
        const result = state.safeParse("  ");
        expect(result.error?.issues.map((issue) => issue.message)).toEqual(["Choose a state"]);
    });

    it("rejects anything that isn't a US state code", () => {
        const result = state.safeParse("XX");
        expect(result.error?.issues.map((issue) => issue.message)).toEqual(["Choose a US state"]);
    });
});

describe("zip", () => {
    it("accepts 5 digits or ZIP+4", () => {
        expect(zip.parse(" 29401 ")).toBe("29401");
        expect(zip.parse("29401-1234")).toBe("29401-1234");
    });

    it("reports only the blank message when empty", () => {
        const result = zip.safeParse("");
        expect(result.error?.issues.map((issue) => issue.message)).toEqual(["Enter a zip code"]);
    });

    it("rejects a malformed zip", () => {
        for (const bad of ["2940", "294011", "29401-12", "abcde"]) {
            const result = zip.safeParse(bad);
            expect(result.error?.issues.map((issue) => issue.message)).toEqual(["Enter a 5-digit zip code"]);
        }
    });
});

describe("optionalZip", () => {
    it("turns empty, blank or missing into null", () => {
        expect(optionalZip.parse("")).toBeNull();
        expect(optionalZip.parse("  ")).toBeNull();
        expect(optionalZip.parse(undefined)).toBeNull();
    });

    it("rejects a malformed zip", () => {
        expect(optionalZip.safeParse("2940").success).toBe(false);
    });
});
