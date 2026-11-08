import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
    default: {
        property: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
        unit: { findFirst: vi.fn(), aggregate: vi.fn(), create: vi.fn() },
        contact: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
        workOrder: { count: vi.fn(), updateMany: vi.fn() },
        $transaction: vi.fn(),
    },
}));

import prisma from "@/lib/prisma";
import {
    addUnit,
    createContact,
    createContactInput,
    createProperty,
    createPropertyInput,
    getContact,
    getProperty,
    searchContacts,
    updateContact,
    updateContactInput,
    updateProperty,
    updatePropertyInput,
} from "./records";

const property = {
    propertyType: "DUPLEX",
    displayName: "Maple Duplex",
    addressLine1: "123 Maple St",
    city: "Greenville",
    state: "sc",
    zipCode: "29601",
};

beforeEach(() => {
    vi.clearAllMocks();
});

describe("createProperty", () => {
    it("creates the given units in order, each with the organization", async () => {
        vi.mocked(prisma.property.create).mockResolvedValue({
            id: "prop1",
            displayName: "Maple Duplex",
            units: [
                { id: "u1", name: "A" },
                { id: "u2", name: "B" },
            ],
        } as never);

        const input = createPropertyInput.parse({ ...property, units: [{ name: " A " }, { name: "B" }] });
        const result = await createProperty("org1", input);

        expect(result).toEqual({
            id: "prop1",
            displayName: "Maple Duplex",
            units: [
                { id: "u1", name: "A" },
                { id: "u2", name: "B" },
            ],
        });
        const args = vi.mocked(prisma.property.create).mock.calls[0][0];
        expect(args.data).toMatchObject({
            organizationId: "org1",
            displayName: "Maple Duplex",
            state: "SC",
            units: {
                create: [
                    { name: "A", isDefault: false, sortOrder: 0, organizationId: "org1" },
                    { name: "B", isDefault: false, sortOrder: 1, organizationId: "org1" },
                ],
            },
        });
        expect(args.include).toEqual({
            units: { orderBy: { sortOrder: "asc" }, select: { id: true, name: true } },
        });
    });

    it("creates one default unit named Main when no units are given", async () => {
        vi.mocked(prisma.property.create).mockResolvedValue({
            id: "prop1",
            displayName: "Maple Duplex",
            units: [{ id: "u1", name: "Main" }],
        } as never);

        await createProperty("org1", createPropertyInput.parse(property));

        expect(vi.mocked(prisma.property.create).mock.calls[0][0].data.units).toEqual({
            create: [{ name: "Main", isDefault: true, sortOrder: 0, organizationId: "org1" }],
        });
    });

    it("rejects duplicate unit names and an unknown property type", () => {
        expect(createPropertyInput.safeParse({ ...property, units: [{ name: "A" }, { name: "a" }] }).success).toBe(
            false,
        );
        expect(createPropertyInput.safeParse({ ...property, propertyType: "CASTLE" }).success).toBe(false);
    });
});

describe("createContactInput", () => {
    it("requires a unitId for a tenant", () => {
        const parsed = createContactInput.safeParse({ contactType: "TENANT", displayName: "Ana Ruiz" });
        expect(parsed.success).toBe(false);
        expect(parsed.error?.issues[0]).toMatchObject({ path: ["unitId"], message: expect.stringContaining("unitId") });
    });

    it("makes email and phone optional but still validates them", () => {
        expect(createContactInput.parse({ contactType: "CONTRACTOR", displayName: "Joe's Plumbing" })).toMatchObject({
            email: null,
            phone: null,
        });
        expect(
            createContactInput.safeParse({ contactType: "CONTRACTOR", displayName: "Joe", email: "not-an-email" })
                .success,
        ).toBe(false);
        expect(
            createContactInput.parse({ contactType: "CONTRACTOR", displayName: "Joe", phone: "+1 (864) 555-0100" })
                .phone,
        ).toBe("8645550100");
        expect(
            createContactInput.safeParse({ contactType: "CONTRACTOR", displayName: "Joe", phone: "555-0100" }).success,
        ).toBe(false);
    });
});

describe("createContact", () => {
    beforeEach(() => {
        vi.mocked(prisma.contact.create).mockResolvedValue({
            id: "c1",
            displayName: "Ana Ruiz",
            contactType: "TENANT",
        } as never);
    });

    it("checks a tenant's unit in the organization and creates the contact", async () => {
        vi.mocked(prisma.unit.findFirst).mockResolvedValue({ id: "unit1" } as never);
        const input = createContactInput.parse({ contactType: "TENANT", displayName: "Ana Ruiz", unitId: "unit1" });

        await expect(createContact("org1", input)).resolves.toEqual({
            ok: true,
            contact: { id: "c1", displayName: "Ana Ruiz", contactType: "TENANT" },
        });
        expect(vi.mocked(prisma.unit.findFirst).mock.calls[0][0]).toEqual({
            where: { id: "unit1", organizationId: "org1", archived: false, property: { archived: false } },
        });
        expect(vi.mocked(prisma.contact.create).mock.calls[0][0].data).toMatchObject({
            organizationId: "org1",
            contactType: "TENANT",
            unitId: "unit1",
        });
    });

    it("returns an error without creating anything when the unit isn't found", async () => {
        vi.mocked(prisma.unit.findFirst).mockResolvedValue(null);
        const input = createContactInput.parse({ contactType: "TENANT", displayName: "Ana", unitId: "other-org" });

        await expect(createContact("org1", input)).resolves.toEqual({
            ok: false,
            error: "That unit wasn't found. Choose it again from search_properties.",
        });
        expect(prisma.contact.create).not.toHaveBeenCalled();
    });

    it("marks a contractor in-house, never a tenant, and defaults to not in-house", async () => {
        vi.mocked(prisma.unit.findFirst).mockResolvedValue({ id: "unit1" } as never);
        const data = () => vi.mocked(prisma.contact.create).mock.calls.at(-1)?.[0].data;

        await createContact(
            "org1",
            createContactInput.parse({ contactType: "CONTRACTOR", displayName: "Sam", inHouse: true }),
        );
        expect(data()).toMatchObject({ inHouse: true });

        await createContact(
            "org1",
            createContactInput.parse({ contactType: "TENANT", displayName: "Ana", unitId: "unit1", inHouse: true }),
        );
        expect(data()).toMatchObject({ inHouse: false });

        await createContact("org1", createContactInput.parse({ contactType: "OTHER", displayName: "Handy Co" }));
        expect(data()).toMatchObject({ inHouse: false });
    });

    it("drops a unitId given for a non-tenant without looking it up", async () => {
        const input = createContactInput.parse({ contactType: "CONTRACTOR", displayName: "Joe", unitId: "unit1" });

        await createContact("org1", input);

        expect(prisma.unit.findFirst).not.toHaveBeenCalled();
        expect(vi.mocked(prisma.contact.create).mock.calls[0][0].data).toMatchObject({ unitId: null });
    });
});

describe("searchContacts", () => {
    const joes = {
        id: "joes",
        displayName: "Joe's Plumbing",
        firstName: "Joe",
        lastName: "Smith",
        company: "Joe's Plumbing",
        contactType: "CONTRACTOR",
        unit: null,
    };
    const ana = {
        id: "ana",
        displayName: "Ana Ruiz",
        firstName: "Ana",
        lastName: "Ruiz",
        company: null,
        contactType: "TENANT",
        unit: { id: "unit1", name: "B", property: { id: "prop1", displayName: "Maple Duplex" } },
    };

    beforeEach(() => {
        vi.mocked(prisma.contact.findMany).mockResolvedValue([joes, ana] as never);
    });

    it("returns a compact match with a tenant's unit and property", async () => {
        await expect(searchContacts("org1", { query: "Ana Ruiz" })).resolves.toEqual({
            status: "matched",
            match: { id: "ana", displayName: "Ana Ruiz", contactType: "TENANT", company: null, unit: ana.unit },
        });
        expect(vi.mocked(prisma.contact.findMany).mock.calls[0][0]?.where).toEqual({
            organizationId: "org1",
            archived: false,
        });
    });

    it("narrows by type, with ASSIGNABLE meaning contractors and other contacts", async () => {
        await searchContacts("org1", { query: "Joe", type: "ASSIGNABLE" });
        await searchContacts("org1", { query: "Ana", type: "TENANT" });

        const calls = vi.mocked(prisma.contact.findMany).mock.calls;
        expect(calls[0][0]?.where).toEqual({
            organizationId: "org1",
            archived: false,
            contactType: { in: ["CONTRACTOR", "OTHER"] },
        });
        expect(calls[1][0]?.where).toEqual({ organizationId: "org1", archived: false, contactType: "TENANT" });
    });

    it("returns notFound when nothing is close", async () => {
        await expect(searchContacts("org1", { query: "Zebra Roofing" })).resolves.toEqual({ status: "notFound" });
    });
});

describe("getProperty", () => {
    it("returns null for a property outside the organization, without counting work orders", async () => {
        vi.mocked(prisma.property.findFirst).mockResolvedValue(null);
        await expect(getProperty("org1", "prop9")).resolves.toBeNull();
        expect(vi.mocked(prisma.property.findFirst).mock.calls[0][0]).toMatchObject({
            where: { id: "prop9", organizationId: "org1" },
        });
        expect(prisma.workOrder.count).not.toHaveBeenCalled();
    });

    it("returns the property with its units' tenants and the open work order count", async () => {
        const tenant = { id: "ana", displayName: "Ana Ruiz", phone: null, email: "ana@example.com" };
        vi.mocked(prisma.property.findFirst).mockResolvedValue({
            ...property,
            id: "prop1",
            state: "SC",
            addressLine2: null,
            notes: null,
            favorite: false,
            archived: false,
            organizationId: "org1",
            units: [{ id: "unit1", name: "B", isDefault: false, contacts: [tenant] }],
        } as never);
        vi.mocked(prisma.workOrder.count).mockResolvedValue(2);

        await expect(getProperty("org1", "prop1")).resolves.toEqual({
            id: "prop1",
            propertyType: "DUPLEX",
            displayName: "Maple Duplex",
            addressLine1: "123 Maple St",
            addressLine2: null,
            city: "Greenville",
            state: "SC",
            zipCode: "29601",
            notes: null,
            favorite: false,
            archived: false,
            units: [{ id: "unit1", name: "B", isDefault: false, tenants: [tenant] }],
            openWorkOrders: 2,
        });
        expect(vi.mocked(prisma.workOrder.count).mock.calls[0][0]).toEqual({
            where: {
                organizationId: "org1",
                propertyId: "prop1",
                archived: false,
                status: { in: ["DRAFT", "SENT", "IN_PROGRESS"] },
            },
        });
    });
});

describe("getContact", () => {
    it("returns the contact without its organizationId, with its unit and open work orders", async () => {
        const created = new Date("2026-11-01T12:00:00Z");
        const unit = { id: "unit1", name: "B", property: { id: "prop1", displayName: "Maple Duplex" } };
        vi.mocked(prisma.contact.findFirst).mockResolvedValue({
            id: "ana",
            organizationId: "org1",
            unitId: "unit1",
            contactType: "TENANT",
            displayName: "Ana Ruiz",
            firstName: "Ana",
            lastName: "Ruiz",
            company: null,
            addressLine1: null,
            addressLine2: null,
            city: null,
            state: null,
            zipCode: null,
            email: "ana@example.com",
            phone: "8645550100",
            notes: null,
            favorite: true,
            archived: false,
            createdAt: created,
            updatedAt: created,
            unit,
        } as never);
        vi.mocked(prisma.workOrder.count).mockResolvedValue(1);

        const contact = await getContact("org1", "ana");

        expect(contact).toMatchObject({
            id: "ana",
            contactType: "TENANT",
            email: "ana@example.com",
            favorite: true,
            createdAt: created.toISOString(),
            unit,
            openWorkOrders: 1,
        });
        expect(contact).not.toHaveProperty("organizationId");
        expect(vi.mocked(prisma.contact.findFirst).mock.calls[0][0]).toMatchObject({
            where: { id: "ana", organizationId: "org1" },
        });
        expect(vi.mocked(prisma.workOrder.count).mock.calls[0][0]).toMatchObject({
            where: { organizationId: "org1", OR: [{ contractorId: "ana" }, { tenantId: "ana" }] },
        });
    });

    it("returns null for a contact outside the organization", async () => {
        vi.mocked(prisma.contact.findFirst).mockResolvedValue(null);
        await expect(getContact("org1", "other")).resolves.toBeNull();
    });
});

describe("addUnit", () => {
    function withProperty(overrides: Record<string, unknown> = {}) {
        vi.mocked(prisma.property.findFirst).mockResolvedValue({
            id: "prop1",
            archived: false,
            units: [{ name: "A" }, { name: "B" }],
            ...overrides,
        } as never);
    }

    it("adds the unit after the last one", async () => {
        withProperty();
        vi.mocked(prisma.unit.aggregate).mockResolvedValue({ _max: { sortOrder: 4 } } as never);
        vi.mocked(prisma.unit.create).mockResolvedValue({ id: "unit3", name: "C" } as never);

        await expect(addUnit("org1", { propertyId: "prop1", name: "C" })).resolves.toEqual({
            ok: true,
            unit: { id: "unit3", name: "C" },
        });
        expect(vi.mocked(prisma.property.findFirst).mock.calls[0][0]).toMatchObject({
            where: { id: "prop1", organizationId: "org1" },
        });
        expect(prisma.unit.create).toHaveBeenCalledWith({
            data: { name: "C", propertyId: "prop1", organizationId: "org1", sortOrder: 5 },
        });
    });

    it("refuses a duplicate name ignoring case, an archived property and an unknown one", async () => {
        withProperty();
        await expect(addUnit("org1", { propertyId: "prop1", name: "b" })).resolves.toEqual({
            ok: false,
            error: "b is already a unit here.",
        });

        withProperty({ archived: true });
        await expect(addUnit("org1", { propertyId: "prop1", name: "C" })).resolves.toMatchObject({ ok: false });

        vi.mocked(prisma.property.findFirst).mockResolvedValue(null);
        await expect(addUnit("org1", { propertyId: "other", name: "C" })).resolves.toEqual({
            ok: false,
            error: "No property with that id was found.",
        });
        expect(prisma.unit.create).not.toHaveBeenCalled();
    });
});

describe("updateProperty", () => {
    it("needs a field besides id and treats left-out fields as unchanged", () => {
        expect(updatePropertyInput.safeParse({ id: "prop1" }).success).toBe(false);
        expect(updatePropertyInput.parse({ id: "prop1", state: "sc", notes: "" })).toEqual({
            id: "prop1",
            state: "SC",
            notes: null,
        });
        expect(updatePropertyInput.safeParse({ id: "prop1", zipCode: "123" }).success).toBe(false);
    });

    it("updates only the given fields of a property in the organization", async () => {
        vi.mocked(prisma.property.findFirst).mockResolvedValue({ id: "prop1", archived: false } as never);
        vi.mocked(prisma.property.update).mockResolvedValue({ id: "prop1", displayName: "Maple" } as never);

        await expect(updateProperty("org1", { id: "prop1", displayName: "Maple" })).resolves.toEqual({
            ok: true,
            property: { id: "prop1", displayName: "Maple" },
        });
        expect(vi.mocked(prisma.property.findFirst).mock.calls[0][0]).toEqual({
            where: { id: "prop1", organizationId: "org1" },
        });
        expect(prisma.property.update).toHaveBeenCalledWith({ where: { id: "prop1" }, data: { displayName: "Maple" } });
    });

    it("refuses an archived property", async () => {
        vi.mocked(prisma.property.findFirst).mockResolvedValue({ id: "prop1", archived: true } as never);
        await expect(updateProperty("org1", { id: "prop1", displayName: "Maple" })).resolves.toEqual({
            ok: false,
            error: "Restore this property before editing it.",
        });
        expect(prisma.property.update).not.toHaveBeenCalled();
    });
});

describe("updateContact", () => {
    const joes = {
        id: "joes",
        organizationId: "org1",
        contactType: "CONTRACTOR",
        displayName: "Joe's Plumbing",
        phone: "8645550100",
        email: "joe@example.com",
        unitId: null,
        archived: false,
    };

    beforeEach(() => {
        vi.mocked(prisma.$transaction).mockResolvedValue([] as never);
        vi.mocked(prisma.contact.update).mockReturnValue("contact-update" as never);
        vi.mocked(prisma.workOrder.updateMany).mockReturnValue("work-order-update" as never);
    });

    it("needs a field besides id and still validates email and phone", () => {
        expect(updateContactInput.safeParse({ id: "joes" }).success).toBe(false);
        expect(updateContactInput.parse({ id: "joes", phone: "(864) 555-0199" })).toEqual({
            id: "joes",
            phone: "8645550199",
        });
        expect(updateContactInput.parse({ id: "joes", email: "" })).toEqual({ id: "joes", email: null });
        expect(updateContactInput.safeParse({ id: "joes", email: "nope" }).success).toBe(false);
    });

    it("copies a new phone onto open work orders in the same transaction", async () => {
        vi.mocked(prisma.contact.findFirst).mockResolvedValue(joes as never);

        const result = await updateContact("org1", { id: "joes", phone: "8645550199" });

        expect(result).toEqual({
            ok: true,
            contact: { id: "joes", displayName: "Joe's Plumbing", contactType: "CONTRACTOR" },
        });
        expect(prisma.contact.update).toHaveBeenCalledWith({
            where: { id: "joes" },
            data: { phone: "8645550199", unitId: null },
        });
        const open = { organizationId: "org1", archived: false, status: { in: ["DRAFT", "SENT", "IN_PROGRESS"] } };
        expect(prisma.workOrder.updateMany).toHaveBeenCalledWith({
            where: { ...open, contractorId: "joes" },
            data: {
                contractorName: "Joe's Plumbing",
                contractorPhone: "8645550199",
                contractorEmail: "joe@example.com",
            },
        });
        expect(prisma.workOrder.updateMany).toHaveBeenCalledWith({
            where: { ...open, tenantId: "joes" },
            data: { tenantName: "Joe's Plumbing", tenantPhone: "8645550199", tenantEmail: "joe@example.com" },
        });
        expect(prisma.$transaction).toHaveBeenCalledWith(["contact-update", "work-order-update", "work-order-update"]);
    });

    it("doesn't touch work orders when the name, phone and email stay the same", async () => {
        vi.mocked(prisma.contact.findFirst).mockResolvedValue(joes as never);

        await updateContact("org1", { id: "joes", company: "Joe's Plumbing LLC" });

        expect(prisma.workOrder.updateMany).not.toHaveBeenCalled();
        expect(prisma.$transaction).toHaveBeenCalledWith(["contact-update"]);
    });

    it("refuses a type change for a contact on work orders, and an archived contact", async () => {
        vi.mocked(prisma.contact.findFirst).mockResolvedValue(joes as never);
        vi.mocked(prisma.workOrder.count).mockResolvedValue(3);
        await expect(updateContact("org1", { id: "joes", contactType: "OTHER" })).resolves.toEqual({
            ok: false,
            error: "This contact is on work orders, so its type can't change.",
        });

        vi.mocked(prisma.contact.findFirst).mockResolvedValue({ ...joes, archived: true } as never);
        await expect(updateContact("org1", { id: "joes", displayName: "Joe" })).resolves.toEqual({
            ok: false,
            error: "Restore this contact before editing it.",
        });
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("checks a tenant's new unit in the organization", async () => {
        const ana = { ...joes, id: "ana", contactType: "TENANT", unitId: "unit1" };
        vi.mocked(prisma.contact.findFirst).mockResolvedValue(ana as never);
        vi.mocked(prisma.unit.findFirst).mockResolvedValue(null);

        await expect(updateContact("org1", { id: "ana", unitId: "unit9" })).resolves.toMatchObject({ ok: false });
        expect(vi.mocked(prisma.unit.findFirst).mock.calls[0][0]).toEqual({
            where: { id: "unit9", organizationId: "org1", archived: false, property: { archived: false } },
        });
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("drops the unit when a tenant with no work orders becomes another type", async () => {
        const ana = { ...joes, id: "ana", contactType: "TENANT", unitId: "unit1" };
        vi.mocked(prisma.contact.findFirst).mockResolvedValue(ana as never);
        vi.mocked(prisma.workOrder.count).mockResolvedValue(0);

        await updateContact("org1", { id: "ana", contactType: "OTHER", unitId: "unit1" });

        expect(prisma.unit.findFirst).not.toHaveBeenCalled();
        expect(prisma.contact.update).toHaveBeenCalledWith({
            where: { id: "ana" },
            data: { contactType: "OTHER", unitId: null },
        });
    });
});
