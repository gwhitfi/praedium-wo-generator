// Server-only. Property and contact reads and writes for the MCP tools, matching the app's forms and actions.
// Every query is scoped to the API key's organization. Expected failures come back as { ok: false, error }.
import { z } from "zod";
import type { ContactType, Prisma, PropertyType } from "@/generated/prisma/client";
import { contactInput } from "@/app/(app)/contacts/schemas";
import { MAX_UNIT_NAME_LENGTH, propertyInput, unitList } from "@/app/(app)/properties/schemas";
import prisma from "@/lib/prisma";
import { optionalEmail, optionalPhone, tooLong } from "@/lib/validation";
import { matchContact, type MatchResult } from "@/lib/workOrderMatch";
import { OPEN_STATUSES } from "@/lib/workOrders";

type Failure = { ok: false; error: string };

const id = z.string().min(1).max(100);

const PROPERTY_NOT_FOUND = "No property with that id was found.";
const CONTACT_NOT_FOUND = "No contact with that id was found.";

// Patch inputs need at least one field to change besides the id.
const hasChange = (input: Record<string, unknown>): boolean =>
    Object.entries(input).some(([key, value]) => key !== "id" && value !== undefined);
const NO_CHANGE = "Give at least one field to change besides id.";

// The property form's fields plus its unit list, as `{ name }` objects. No units means one unit named "Main".
export const createPropertyInput = propertyInput.extend({ units: unitList.default([]) });

export type CreatedProperty = { id: string; displayName: string; units: { id: string; name: string }[] };

export async function createProperty(
    organizationId: string,
    input: z.output<typeof createPropertyInput>,
): Promise<CreatedProperty> {
    const { units, ...fields } = input;
    const unitsToCreate =
        units.length > 0
            ? units.map((unit, i) => ({ name: unit.name, isDefault: false, sortOrder: i, organizationId }))
            : [{ name: "Main", isDefault: true, sortOrder: 0, organizationId }];

    const property = await prisma.property.create({
        data: { organizationId, ...fields, units: { create: unitsToCreate } },
        include: { units: { orderBy: { sortOrder: "asc" }, select: { id: true, name: true } } },
    });
    return { id: property.id, displayName: property.displayName, units: property.units };
}

// The contact form's fields, except that email and phone are optional: an assistant often doesn't have them.
export const createContactInput = contactInput
    .extend({ email: optionalEmail, phone: optionalPhone, inHouse: z.boolean().default(false) })
    .superRefine((contact, ctx) => {
        if (contact.contactType === "TENANT" && !contact.unitId) {
            ctx.addIssue({
                code: "custom",
                path: ["unitId"],
                message: "A tenant needs a unitId. Get it from the property's units in search_properties.",
            });
        }
    });

export type CreateContactResult =
    { ok: true; contact: { id: string; displayName: string; contactType: ContactType } } | { ok: false; error: string };

export async function createContact(
    organizationId: string,
    input: z.output<typeof createContactInput>,
): Promise<CreateContactResult> {
    // Only tenants belong to a unit, as on the contact form.
    const unitId = input.contactType === "TENANT" ? input.unitId : null;
    if (unitId) {
        const unit = await prisma.unit.findFirst({
            where: { id: unitId, organizationId, archived: false, property: { archived: false } },
        });
        if (!unit) return { ok: false, error: "That unit wasn't found. Choose it again from search_properties." };
    }

    const inHouse = input.contactType !== "TENANT" && input.inHouse;
    const contact = await prisma.contact.create({ data: { organizationId, ...input, unitId, inHouse } });
    return {
        ok: true,
        contact: { id: contact.id, displayName: contact.displayName, contactType: contact.contactType },
    };
}

// ASSIGNABLE is the set the app lets you put on a work order as its contractor: CONTRACTOR and OTHER.
export const searchContactsInput = z.object({
    query: z.string().trim().min(1).max(200),
    type: z.enum(["TENANT", "CONTRACTOR", "OTHER", "ASSIGNABLE"]).optional(),
});

type UnitRef = { id: string; name: string; property: { id: string; displayName: string } };

export type ContactResult = {
    id: string;
    displayName: string;
    contactType: ContactType;
    company: string | null;
    inHouse: boolean;
    unit: UnitRef | null;
};

const unitRefSelect = {
    select: { id: true, name: true, property: { select: { id: true, displayName: true } } },
} as const;

// The organization's non-archived contacts of that type (all types when it's left out), matched by name or company.
export async function searchContacts(
    organizationId: string,
    { query, type }: z.output<typeof searchContactsInput>,
): Promise<MatchResult<ContactResult>> {
    const contactType: Prisma.ContactWhereInput["contactType"] =
        type === "ASSIGNABLE" ? { in: ["CONTRACTOR", "OTHER"] } : type;
    const contacts = await prisma.contact.findMany({
        where: { organizationId, archived: false, ...(contactType ? { contactType } : {}) },
        select: {
            id: true,
            displayName: true,
            firstName: true,
            lastName: true,
            company: true,
            contactType: true,
            inHouse: true,
            unit: unitRefSelect,
        },
    });

    const result = matchContact(query, contacts);
    const compact = (contact: (typeof contacts)[number]): ContactResult => ({
        id: contact.id,
        displayName: contact.displayName,
        contactType: contact.contactType,
        company: contact.company,
        inHouse: contact.inHouse,
        unit: contact.unit,
    });
    if (result.status === "matched") return { status: "matched", match: compact(result.match) };
    if (result.status === "ambiguous") return { status: "ambiguous", candidates: result.candidates.map(compact) };
    return result;
}

export const getRecordInput = z.object({ id });

export type PropertyDetail = {
    id: string;
    propertyType: PropertyType;
    displayName: string;
    addressLine1: string;
    addressLine2: string | null;
    city: string;
    state: string;
    zipCode: string;
    notes: string | null;
    favorite: boolean;
    archived: boolean;
    units: {
        id: string;
        name: string;
        isDefault: boolean;
        tenants: { id: string; displayName: string; phone: string | null; email: string | null }[];
    }[];
    // Draft, Sent or In progress, not archived.
    openWorkOrders: number;
};

// One property of the organization, archived or not, with its units and their tenants. Null if it isn't theirs.
export async function getProperty(organizationId: string, propertyId: string): Promise<PropertyDetail | null> {
    const property = await prisma.property.findFirst({
        where: { id: propertyId, organizationId },
        include: {
            units: {
                where: { archived: false },
                orderBy: { sortOrder: "asc" },
                select: {
                    id: true,
                    name: true,
                    isDefault: true,
                    contacts: {
                        where: { archived: false, contactType: "TENANT" },
                        orderBy: { displayName: "asc" },
                        select: { id: true, displayName: true, phone: true, email: true },
                    },
                },
            },
        },
    });
    if (!property) return null;

    const openWorkOrders = await prisma.workOrder.count({
        where: { organizationId, propertyId: property.id, archived: false, status: { in: OPEN_STATUSES } },
    });

    return {
        id: property.id,
        propertyType: property.propertyType,
        displayName: property.displayName,
        addressLine1: property.addressLine1,
        addressLine2: property.addressLine2,
        city: property.city,
        state: property.state,
        zipCode: property.zipCode,
        notes: property.notes,
        favorite: property.favorite,
        archived: property.archived,
        units: property.units.map(({ contacts, ...unit }) => ({ ...unit, tenants: contacts })),
        openWorkOrders,
    };
}

export type ContactDetail = {
    id: string;
    contactType: ContactType;
    displayName: string;
    firstName: string | null;
    lastName: string | null;
    company: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
    email: string | null;
    phone: string | null;
    notes: string | null;
    favorite: boolean;
    inHouse: boolean;
    archived: boolean;
    createdAt: string;
    updatedAt: string;
    unit: UnitRef | null;
    // Open, non-archived work orders with this contact as the contractor or the tenant.
    openWorkOrders: number;
};

// One contact of the organization, archived or not. Null if it isn't theirs.
export async function getContact(organizationId: string, contactId: string): Promise<ContactDetail | null> {
    const contact = await prisma.contact.findFirst({
        where: { id: contactId, organizationId },
        include: { unit: unitRefSelect },
    });
    if (!contact) return null;

    const openWorkOrders = await prisma.workOrder.count({
        where: {
            organizationId,
            archived: false,
            status: { in: OPEN_STATUSES },
            OR: [{ contractorId: contact.id }, { tenantId: contact.id }],
        },
    });

    return {
        id: contact.id,
        contactType: contact.contactType,
        displayName: contact.displayName,
        firstName: contact.firstName,
        lastName: contact.lastName,
        company: contact.company,
        addressLine1: contact.addressLine1,
        addressLine2: contact.addressLine2,
        city: contact.city,
        state: contact.state,
        zipCode: contact.zipCode,
        email: contact.email,
        phone: contact.phone,
        notes: contact.notes,
        favorite: contact.favorite,
        inHouse: contact.inHouse,
        archived: contact.archived,
        createdAt: contact.createdAt.toISOString(),
        updatedAt: contact.updatedAt.toISOString(),
        unit: contact.unit,
        openWorkOrders,
    };
}

export const addUnitInput = z.object({
    propertyId: id,
    name: z.string().trim().min(1).max(MAX_UNIT_NAME_LENGTH, tooLong(MAX_UNIT_NAME_LENGTH)),
});

// Adds a unit at the end of the property's list, as the property page does. Names are unique per property,
// ignoring case, among units that aren't archived.
export async function addUnit(
    organizationId: string,
    input: z.output<typeof addUnitInput>,
): Promise<{ ok: true; unit: { id: string; name: string } } | Failure> {
    const property = await prisma.property.findFirst({
        where: { id: input.propertyId, organizationId },
        include: { units: { where: { archived: false }, select: { name: true } } },
    });
    if (!property) return { ok: false, error: PROPERTY_NOT_FOUND };
    if (property.archived) return { ok: false, error: "Restore this property before adding units to it." };

    const wanted = input.name.toLowerCase();
    if (property.units.some((unit) => unit.name.toLowerCase() === wanted)) {
        return { ok: false, error: `${input.name} is already a unit here.` };
    }

    const last = await prisma.unit.aggregate({ where: { propertyId: property.id }, _max: { sortOrder: true } });
    const unit = await prisma.unit.create({
        data: {
            name: input.name,
            propertyId: property.id,
            organizationId,
            sortOrder: (last._max.sortOrder ?? -1) + 1,
        },
    });
    return { ok: true, unit: { id: unit.id, name: unit.name } };
}

// Patch semantics over the property form's fields: a field left out stays as it is; an empty string clears
// addressLine2 or notes. Units are added with add_unit.
export const updatePropertyInput = propertyInput.partial().extend({ id }).refine(hasChange, NO_CHANGE);

export async function updateProperty(
    organizationId: string,
    input: z.output<typeof updatePropertyInput>,
): Promise<{ ok: true; property: { id: string; displayName: string } } | Failure> {
    const { id: propertyId, ...fields } = input;
    const property = await prisma.property.findFirst({ where: { id: propertyId, organizationId } });
    if (!property) return { ok: false, error: PROPERTY_NOT_FOUND };
    if (property.archived) return { ok: false, error: "Restore this property before editing it." };

    const updated = await prisma.property.update({ where: { id: property.id }, data: fields });
    return { ok: true, property: { id: updated.id, displayName: updated.displayName } };
}

// Patch semantics over the contact form's fields, with email and phone optional as in create_contact: a field
// left out stays as it is; an empty string clears an optional one.
export const updateContactInput = contactInput
    .extend({ email: optionalEmail, phone: optionalPhone })
    .partial()
    .extend({ id })
    .refine(hasChange, NO_CHANGE);

export type UpdateContactResult =
    { ok: true; contact: { id: string; displayName: string; contactType: ContactType } } | Failure;

// Follows the contact form's updateContact: archived contacts can't change, the type is fixed once the contact is
// on a work order, only tenants keep a unit, and new name, phone or email are copied onto open work orders.
export async function updateContact(
    organizationId: string,
    input: z.output<typeof updateContactInput>,
): Promise<UpdateContactResult> {
    const { id: contactId, ...fields } = input;
    const contact = await prisma.contact.findFirst({ where: { id: contactId, organizationId } });
    if (!contact) return { ok: false, error: CONTACT_NOT_FOUND };
    if (contact.archived) return { ok: false, error: "Restore this contact before editing it." };

    const contactType = fields.contactType ?? contact.contactType;
    if (contactType !== contact.contactType) {
        const onWorkOrders = await prisma.workOrder.count({
            where: { organizationId, OR: [{ contractorId: contact.id }, { tenantId: contact.id }] },
        });
        if (onWorkOrders > 0) return { ok: false, error: "This contact is on work orders, so its type can't change." };
    }

    const unitId = contactType === "TENANT" ? fields.unitId : null;
    if (unitId) {
        const unit = await prisma.unit.findFirst({
            where: { id: unitId, organizationId, archived: false, property: { archived: false } },
        });
        if (!unit) return { ok: false, error: "That unit wasn't found. Get its id from get_property." };
    }

    const name = fields.displayName ?? contact.displayName;
    const phone = fields.phone !== undefined ? fields.phone : contact.phone;
    const email = fields.email !== undefined ? fields.email : contact.email;
    const snapshotChanged = name !== contact.displayName || phone !== contact.phone || email !== contact.email;
    const openWorkOrders = { organizationId, archived: false, status: { in: OPEN_STATUSES } };

    // Tenants are never in-house; for the other types, a missing inHouse leaves it as it is.
    const inHouse = contactType === "TENANT" ? false : fields.inHouse;

    await prisma.$transaction([
        prisma.contact.update({ where: { id: contact.id }, data: { ...fields, unitId, inHouse } }),
        ...(snapshotChanged
            ? [
                  prisma.workOrder.updateMany({
                      where: { ...openWorkOrders, contractorId: contact.id },
                      data: { contractorName: name, contractorPhone: phone, contractorEmail: email },
                  }),
                  prisma.workOrder.updateMany({
                      where: { ...openWorkOrders, tenantId: contact.id },
                      data: { tenantName: name, tenantPhone: phone, tenantEmail: email },
                  }),
              ]
            : []),
    ]);

    return { ok: true, contact: { id: contact.id, displayName: name, contactType } };
}
