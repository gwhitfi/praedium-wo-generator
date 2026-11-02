import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./prisma", () => ({
    default: { property: { findMany: vi.fn() }, contact: { findMany: vi.fn() } },
}));

import prisma from "./prisma";
import { contractorLookup, propertyLookup } from "./workOrderLookup";

const maple = {
    id: "maple",
    displayName: "Maple Court",
    addressLine1: "123 Maple St",
    city: "Charleston",
    units: [
        { id: "4b", name: "4B", isDefault: false },
        { id: "4c", name: "4C", isDefault: false },
    ],
};
const oak = {
    id: "oak",
    displayName: "Oak House",
    addressLine1: "45 Oak Ave",
    city: "Charleston",
    units: [{ id: "main", name: "Main", isDefault: true }],
};

const joes = { id: "joes", displayName: "Joe's Plumbing", firstName: null, lastName: null, company: "Joe's Plumbing" };

beforeEach(() => {
    vi.clearAllMocks();
});

describe("propertyLookup", () => {
    beforeEach(() => {
        vi.mocked(prisma.property.findMany).mockResolvedValue([maple, oak] as never);
    });

    it("only loads the organization's properties and units that aren't archived", async () => {
        await propertyLookup("org1", "Maple Court", null);

        const args = vi.mocked(prisma.property.findMany).mock.calls[0][0];
        expect(args?.where).toEqual({ organizationId: "org1", archived: false });
        expect(args?.select?.units).toMatchObject({ where: { archived: false } });
    });

    it("matches the property and the unit within it", async () => {
        const result = await propertyLookup("org1", "123 Maple Street", "Unit 4C");

        expect(result.property).toEqual({ status: "matched", match: maple });
        expect(result.unit).toEqual({ status: "matched", match: maple.units[1] });
    });

    it("uses a single-unit property's only unit", async () => {
        const result = await propertyLookup("org1", "Oak House", null);

        expect(result.unit).toEqual({ status: "matched", match: oak.units[0] });
    });

    it("reports a missing unit on a multi-unit property", async () => {
        const result = await propertyLookup("org1", "Maple Court", null);

        expect(result.property.status).toBe("matched");
        expect(result.unit).toEqual({ status: "notFound" });
    });

    it("doesn't look for a unit until the property is matched", async () => {
        const result = await propertyLookup("org1", "Birch Lane", "4B");

        expect(result).toEqual({ property: { status: "notFound" }, unit: null });
    });
});

describe("contractorLookup", () => {
    beforeEach(() => {
        vi.mocked(prisma.contact.findMany).mockResolvedValue([joes] as never);
    });

    it("only loads the organization's contractors that aren't archived", async () => {
        await contractorLookup("org1", "Joe");

        const args = vi.mocked(prisma.contact.findMany).mock.calls[0][0];
        expect(args?.where).toEqual({
            organizationId: "org1",
            archived: false,
            contactType: { in: ["CONTRACTOR", "OTHER"] },
        });
    });

    it("matches the contractor", async () => {
        expect(await contractorLookup("org1", "Joe the plumber")).toEqual({ status: "matched", match: joes });
    });

    it("reports not found when no contractor was given", async () => {
        expect(await contractorLookup("org1", null)).toEqual({ status: "notFound" });
    });
});
