// Server-only. Finds the property, unit and contractor a work order draft describes, among the organization's
// records that aren't archived. The review screen shows a picker for anything not matched.
import prisma from "./prisma";
import { matchContact, matchProperty, matchUnit, type MatchResult } from "./workOrderMatch";

export type UnitOption = { id: string; name: string; isDefault: boolean };

export type PropertyOption = {
    id: string;
    displayName: string;
    addressLine1: string;
    city: string;
    units: UnitOption[];
};

export type ContractorOption = {
    id: string;
    displayName: string;
    firstName: string | null;
    lastName: string | null;
    company: string | null;
    inHouse: boolean;
};

// `unit` is null until the property is matched, since units are only looked for within it.
export type PropertyLookup = { property: MatchResult<PropertyOption>; unit: MatchResult<UnitOption> | null };

export async function propertyLookup(
    organizationId: string,
    propertyText: string,
    unitText: string | null,
): Promise<PropertyLookup> {
    const properties = await prisma.property.findMany({
        where: { organizationId, archived: false },
        select: {
            id: true,
            displayName: true,
            addressLine1: true,
            city: true,
            units: {
                where: { archived: false },
                orderBy: { sortOrder: "asc" },
                select: { id: true, name: true, isDefault: true },
            },
        },
    });

    const property = matchProperty(propertyText, properties);
    const unit = property.status === "matched" ? matchUnit(unitText, property.match.units) : null;
    return { property, unit };
}

export async function contractorLookup(
    organizationId: string,
    contractorText: string | null,
): Promise<MatchResult<ContractorOption>> {
    const contacts = await prisma.contact.findMany({
        where: { organizationId, archived: false, contactType: { in: ["CONTRACTOR", "OTHER"] } },
        select: { id: true, displayName: true, firstName: true, lastName: true, company: true, inHouse: true },
    });

    return matchContact(contractorText, contacts);
}
