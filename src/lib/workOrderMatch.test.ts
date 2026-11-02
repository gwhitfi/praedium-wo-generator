import { describe, expect, it } from "vitest";
import { matchContact, matchProperty, matchUnit } from "./workOrderMatch";

const property = (id: string, displayName: string, addressLine1: string, city = "Charleston") => ({
    id,
    displayName,
    addressLine1,
    city,
});

const contact = (
    id: string,
    displayName: string,
    fields: { firstName?: string; lastName?: string; company?: string } = {},
) => ({
    id,
    displayName,
    firstName: fields.firstName ?? null,
    lastName: fields.lastName ?? null,
    company: fields.company ?? null,
});

const unit = (id: string, name: string) => ({ id, name });

describe("matchProperty", () => {
    const properties = [
        property("maple", "Maple Court", "123 Maple St"),
        property("oak", "Oak House", "45 Oak Avenue"),
        property("pine", "Pine Ridge", "9 Pine Rd", "Summerville"),
    ];

    it("matches an address with spelled-out street types", () => {
        expect(matchProperty("123 Maple Street", properties)).toEqual({ status: "matched", match: properties[0] });
        expect(matchProperty("45 oak ave.", properties)).toEqual({ status: "matched", match: properties[1] });
    });

    it("matches by property name, ignoring case and filler words", () => {
        expect(matchProperty("the maple court building", properties)).toMatchObject({ match: { id: "maple" } });
    });

    it("matches with a small typo", () => {
        expect(matchProperty("Mapel Court", properties)).toMatchObject({ status: "matched", match: { id: "maple" } });
    });

    it("matches by city when that's what was said", () => {
        expect(matchProperty("the Summerville one", properties)).toMatchObject({ match: { id: "pine" } });
    });

    it("ignores a unit included with the address", () => {
        for (const text of ["123 Maple St apt 4", "123 Maple St, Unit 4B", "123 Maple St #4", "123 Maple St Apt. 4"]) {
            expect(matchProperty(text, properties)).toMatchObject({ status: "matched", match: { id: "maple" } });
        }
    });

    it("never matches a different house number", () => {
        expect(matchProperty("125 Maple St", properties).status).not.toBe("matched");
    });

    it("offers candidates, best first, when more than one fits", () => {
        const similar = [
            property("annex", "Maple Court Annex", "125 Maple St"),
            property("maple", "Maple Court", "123 Maple St"),
            property("oak", "Oak House", "45 Oak Avenue"),
        ];
        const result = matchProperty("Maple Court", similar);
        expect(result.status).toBe("ambiguous");
        if (result.status === "ambiguous") expect(result.candidates.map((p) => p.id)).toEqual(["annex", "maple"]);
    });

    it("offers at most 3 candidates", () => {
        const many = ["a", "b", "c", "d"].map((id) => property(id, `Maple ${id}`, `${id.charCodeAt(0)} Elm St`));
        const result = matchProperty("Maple", many);
        expect(result.status === "ambiguous" && result.candidates).toHaveLength(3);
    });

    it("reports not found when nothing is close, or the query is empty", () => {
        expect(matchProperty("Birch Lane", properties)).toEqual({ status: "notFound" });
        expect(matchProperty("the", properties)).toEqual({ status: "notFound" });
        expect(matchProperty("Maple", [])).toEqual({ status: "notFound" });
    });
});

describe("matchContact", () => {
    const contacts = [
        contact("joes", "Joe's Plumbing", { company: "Joe's Plumbing" }),
        contact("smith", "Joe Smith", { firstName: "Joe", lastName: "Smith", company: "Smith Electric" }),
        contact("johnson", "Mike Johnson", { firstName: "Mike", lastName: "Johnson" }),
        contact("johnston", "Amy Johnston", { firstName: "Amy", lastName: "Johnston" }),
    ];

    it("matches a loose description of the contractor", () => {
        expect(matchContact("Joe the plumber", contacts)).toMatchObject({ status: "matched", match: { id: "joes" } });
    });

    it("matches by company name", () => {
        expect(matchContact("Smith Electric", contacts)).toMatchObject({ status: "matched", match: { id: "smith" } });
    });

    it("prefers an exact name over a similar one", () => {
        expect(matchContact("Johnson", contacts)).toMatchObject({ status: "matched", match: { id: "johnson" } });
    });

    it("asks when a first name fits more than one contact", () => {
        const result = matchContact("Joe", contacts);
        expect(result.status).toBe("ambiguous");
        if (result.status === "ambiguous") expect(result.candidates.map((c) => c.id).sort()).toEqual(["joes", "smith"]);
    });

    it("reports not found when no contractor was given", () => {
        expect(matchContact(null, contacts)).toEqual({ status: "notFound" });
        expect(matchContact("Acme Roofing", contacts)).toEqual({ status: "notFound" });
    });
});

describe("matchUnit", () => {
    const units = [unit("4b", "4B"), unit("4c", "4C"), unit("up", "Upstairs")];

    it("uses a property's only unit whatever was said", () => {
        const main = [unit("main", "Main")];
        expect(matchUnit(null, main)).toEqual({ status: "matched", match: main[0] });
        expect(matchUnit("4B", main)).toEqual({ status: "matched", match: main[0] });
    });

    it("matches unit names written different ways", () => {
        for (const text of ["4B", "unit 4b", "Apt #4B", "apartment 4 b"]) {
            expect(matchUnit(text, units)).toEqual({ status: "matched", match: units[0] });
        }
        expect(matchUnit("upstairs", units)).toEqual({ status: "matched", match: units[2] });
    });

    it("never guesses a similar unit", () => {
        expect(matchUnit("4D", units)).toEqual({ status: "notFound" });
    });

    it("reports not found when no unit was given for a multi-unit property", () => {
        expect(matchUnit(null, units)).toEqual({ status: "notFound" });
        expect(matchUnit("unit", units)).toEqual({ status: "notFound" });
    });
});
