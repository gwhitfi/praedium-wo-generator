"use server";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { notifyContractorsCancelled } from "@/lib/emails/notifyCancelled";
import { DELETE_NOT_CONFIRMED, isDeleteConfirmed } from "@/lib/confirmDelete";
import { formatWorkOrderAddress, OPEN_STATUSES } from "@/lib/workOrders";
import { logEvents, type EventInput } from "@/lib/workOrderEvents";
import { attachmentKeys, onWorkOrders } from "@/lib/attachments";
import { deleteFiles } from "@/lib/storage";
import { propertyInput, unitsInput, type PropertyFormState } from "./schemas";

// Sent back with errors so the form can refill what the user typed.
function submittedValues(formData: FormData) {
    const values: Record<string, string> = {};
    for (const key of [...Object.keys(propertyInput.shape), "units"]) {
        const value = formData.get(key);
        if (typeof value === "string") values[key] = value;
    }
    return values;
}

function readPropertyForm(formData: FormData) {
    const parsed = propertyInput.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
        const state: PropertyFormState = {
            errors: z.flattenError(parsed.error).fieldErrors,
            values: submittedValues(formData),
        };
        return { ok: false as const, state };
    }
    return { ok: true as const, fields: parsed.data };
}

export async function createProperty(prevState: PropertyFormState, formData: FormData): Promise<PropertyFormState> {
    const result = await getCurrentUser();

    if (result.state !== "ready") {
        throw new Error("Not authorized");
    }

    const form = readPropertyForm(formData);
    const parsedUnits = unitsInput.safeParse(formData.get("units") ?? undefined);
    if (!form.ok || !parsedUnits.success) {
        const errors = form.ok ? {} : form.state.errors;
        const units = parsedUnits.success ? undefined : [parsedUnits.error.issues[0].message];
        return { errors: { ...errors, units }, values: submittedValues(formData) };
    }
    const units = parsedUnits.data;

    const unitsToCreate =
        units.length > 0
            ? units.map((u, i) => ({
                  name: u.name,
                  isDefault: false,
                  sortOrder: i,
                  organizationId: result.organization.id,
              }))
            : [{ name: "Main", isDefault: true, sortOrder: 0, organizationId: result.organization.id }];

    const property = await prisma.property.create({
        data: {
            organizationId: result.organization.id,
            ...form.fields,
            units: {
                create: unitsToCreate,
            },
        },
    });

    revalidatePath("/properties");
    if (formData.get("returnTo") === "/work-orders/new") {
        redirect(`/work-orders/new?propertyId=${property.id}`);
    }
    redirect("/properties");
}

async function findProperty(propertyId: string) {
    const result = await getCurrentUser();
    if (result.state !== "ready") throw new Error("Not authorized");

    const property = await prisma.property.findFirst({
        where: { id: propertyId, organizationId: result.organization.id },
    });
    if (!property) throw new Error("Invalid property");

    return { property, organization: result.organization, user: result.user };
}

export async function updateProperty(
    propertyId: string,
    prevState: PropertyFormState,
    formData: FormData,
): Promise<PropertyFormState> {
    const { property } = await findProperty(propertyId);
    if (property.archived) {
        return { error: "Restore this property before editing it.", values: submittedValues(formData) };
    }

    const form = readPropertyForm(formData);
    if (!form.ok) return form.state;

    await prisma.property.update({ where: { id: propertyId }, data: form.fields });

    revalidatePath("/properties");
    revalidatePath(`/properties/${propertyId}`);
    redirect(`/properties/${propertyId}`);
}

export async function archiveProperty(propertyId: string) {
    const { property, organization, user } = await findProperty(propertyId);

    const now = new Date();
    const onProperty = { propertyId, organizationId: organization.id };

    const toNotify = await prisma.workOrder.findMany({
        where: { ...onProperty, archived: false, status: { in: ["SENT", "IN_PROGRESS"] } },
        include: { unit: true },
    });
    // Read before the updates below, to log what each work order goes through.
    const before = await prisma.workOrder.findMany({
        where: onProperty,
        select: { id: true, status: true, archived: true },
    });

    await prisma.$transaction([
        prisma.workOrder.updateMany({
            where: { ...onProperty, status: { in: ["DRAFT", "SENT", "IN_PROGRESS"] } },
            data: { status: "CANCELLED", cancelledAt: now, cancelReason: "Property archived", archived: true },
        }),
        prisma.workOrder.updateMany({
            where: { ...onProperty, status: "COMPLETED" },
            data: { status: "CLOSED", closedAt: now, archived: true },
        }),
        prisma.workOrder.updateMany({ where: onProperty, data: { archived: true } }),
        prisma.property.update({ where: { id: propertyId }, data: { archived: true } }),
    ]);

    const actor = { kind: "office" as const, user };
    await logEvents(
        before.flatMap((wo): EventInput[] => {
            const event = { workOrderId: wo.id, organizationId: organization.id, actor };
            return [
                ...(OPEN_STATUSES.includes(wo.status)
                    ? [{ ...event, type: "CANCELLED" as const, detail: { reason: "Property archived" } }]
                    : []),
                ...(wo.status === "COMPLETED" ? [{ ...event, type: "CLOSED" as const }] : []),
                ...(wo.archived ? [] : [{ ...event, type: "ARCHIVED" as const }]),
            ];
        }),
    );

    notifyContractorsCancelled(
        organization,
        toNotify.map((wo) => ({ ...wo, address: formatWorkOrderAddress(property, wo.unit) })),
    );

    revalidatePath("/properties");
    revalidatePath(`/properties/${propertyId}`);
    revalidatePath("/work-orders");
    revalidatePath("/");
    redirect("/properties");
}

export async function restoreProperty(propertyId: string) {
    await findProperty(propertyId);

    await prisma.property.update({ where: { id: propertyId }, data: { archived: false } });

    revalidatePath("/properties");
    revalidatePath(`/properties/${propertyId}`);
}

export async function togglePropertyFavorite(propertyId: string) {
    const { property } = await findProperty(propertyId);

    await prisma.property.update({ where: { id: propertyId }, data: { favorite: !property.favorite } });

    revalidatePath("/properties");
    revalidatePath(`/properties/${propertyId}`);
}

export async function deleteProperty(propertyId: string, confirmation: string): Promise<ActionResult> {
    if (!isDeleteConfirmed(confirmation)) return DELETE_NOT_CONFIRMED;

    const result = await getCurrentUser();
    if (result.state !== "ready") return { ok: false, error: "Not authorized" };
    const organization = result.organization;

    const property = await prisma.property.findFirst({ where: { id: propertyId, organizationId: organization.id } });
    if (!property) return { ok: false, error: "Property not found." };

    const toNotify = await prisma.workOrder.findMany({
        where: { propertyId, archived: false, status: { in: ["SENT", "IN_PROGRESS"] } },
        include: { unit: true },
    });

    // Photos on the property itself or on any of its work orders.
    const photoKeys = await attachmentKeys(organization.id, {
        OR: [{ propertyId }, onWorkOrders({ propertyId })],
    });

    // Work orders block the property delete (onDelete: Restrict), so they go first. Units cascade.
    await prisma.$transaction([
        prisma.contact.updateMany({ where: { unit: { propertyId } }, data: { unitId: null } }),
        prisma.workOrder.deleteMany({ where: { propertyId } }),
        prisma.property.delete({ where: { id: propertyId } }),
    ]);
    await deleteFiles(photoKeys);

    notifyContractorsCancelled(
        organization,
        toNotify.map((wo) => ({ ...wo, address: formatWorkOrderAddress(property, wo.unit) })),
    );

    revalidatePath("/properties");
    revalidatePath("/work-orders");
    revalidatePath("/contacts");
    revalidatePath("/");
    redirect("/properties");
}

type ActionResult = { ok: true } | { ok: false; error: string };

const MAX_NAME_LENGTH = 100;

function cleanName(name: string) {
    return name.trim().slice(0, MAX_NAME_LENGTH);
}

async function currentOrgId() {
    const result = await getCurrentUser();
    return result.state === "ready" ? result.organization.id : null;
}

function isDuplicate(names: string[], name: string) {
    const lower = name.toLowerCase();
    return names.some((n) => n.toLowerCase() === lower);
}

function revalidateProperty(propertyId: string) {
    revalidatePath(`/properties/${propertyId}`);
    revalidatePath("/properties");
}

export async function addUnit(propertyId: string, rawName: string): Promise<ActionResult> {
    const orgId = await currentOrgId();
    if (!orgId) return { ok: false, error: "Not authorized" };

    const name = cleanName(rawName);
    if (!name) return { ok: false, error: "Enter a unit name." };

    const property = await prisma.property.findFirst({
        where: { id: propertyId, organizationId: orgId, archived: false },
        include: { units: { where: { archived: false } } },
    });
    if (!property) return { ok: false, error: "Property not found." };
    if (
        isDuplicate(
            property.units.map((u) => u.name),
            name,
        )
    ) {
        return { ok: false, error: `${name} is already a unit here.` };
    }

    const last = await prisma.unit.aggregate({ where: { propertyId }, _max: { sortOrder: true } });
    await prisma.unit.create({
        data: { name, propertyId, organizationId: orgId, sortOrder: (last._max.sortOrder ?? -1) + 1 },
    });

    revalidateProperty(propertyId);
    return { ok: true };
}

async function findOpenUnit(unitId: string, orgId: string) {
    return prisma.unit.findFirst({
        where: { id: unitId, organizationId: orgId, archived: false, property: { archived: false } },
    });
}

export async function renameUnit(unitId: string, rawName: string): Promise<ActionResult> {
    const orgId = await currentOrgId();
    if (!orgId) return { ok: false, error: "Not authorized" };

    const name = cleanName(rawName);
    if (!name) return { ok: false, error: "Enter a unit name." };

    const unit = await findOpenUnit(unitId, orgId);
    if (!unit) return { ok: false, error: "Unit not found." };

    const siblings = await prisma.unit.findMany({
        where: { propertyId: unit.propertyId, archived: false, NOT: { id: unitId } },
        select: { name: true },
    });
    if (
        isDuplicate(
            siblings.map((u) => u.name),
            name,
        )
    ) {
        return { ok: false, error: `${name} is already a unit here.` };
    }

    await prisma.unit.update({ where: { id: unitId }, data: { name } });

    revalidateProperty(unit.propertyId);
    return { ok: true };
}

export async function archiveUnit(unitId: string): Promise<ActionResult> {
    const orgId = await currentOrgId();
    if (!orgId) return { ok: false, error: "Not authorized" };

    const unit = await findOpenUnit(unitId, orgId);
    if (!unit) return { ok: false, error: "Unit not found." };

    const [openCount, unitCount] = await Promise.all([
        prisma.workOrder.count({
            where: { unitId, archived: false, status: { in: ["DRAFT", "SENT", "IN_PROGRESS"] } },
        }),
        prisma.unit.count({ where: { propertyId: unit.propertyId, archived: false } }),
    ]);
    if (openCount > 0) {
        return { ok: false, error: "This unit has open work orders. Close or cancel them first." };
    }
    if (unitCount <= 1) return { ok: false, error: "A property needs at least one unit." };

    await prisma.$transaction([
        prisma.contact.updateMany({ where: { unitId, organizationId: orgId }, data: { unitId: null } }),
        prisma.unit.update({ where: { id: unitId }, data: { archived: true } }),
    ]);

    revalidateProperty(unit.propertyId);
    revalidatePath("/contacts");
    return { ok: true };
}

export async function deleteUnit(unitId: string, confirmation: string): Promise<ActionResult> {
    if (!isDeleteConfirmed(confirmation)) return DELETE_NOT_CONFIRMED;

    const result = await getCurrentUser();
    if (result.state !== "ready") return { ok: false, error: "Not authorized" };
    const organization = result.organization;

    const unit = await prisma.unit.findFirst({
        where: { id: unitId, organizationId: organization.id, archived: false, property: { archived: false } },
        include: { property: true },
    });
    if (!unit) return { ok: false, error: "Unit not found." };

    const unitCount = await prisma.unit.count({ where: { propertyId: unit.propertyId, archived: false } });
    if (unitCount <= 1) return { ok: false, error: "A property needs at least one unit. Delete the property instead." };

    const toNotify = await prisma.workOrder.findMany({
        where: { unitId, archived: false, status: { in: ["SENT", "IN_PROGRESS"] } },
    });

    const photoKeys = await attachmentKeys(organization.id, onWorkOrders({ unitId }));

    // Work orders would only lose their unit, so they're deleted outright.
    await prisma.$transaction([
        prisma.contact.updateMany({ where: { unitId }, data: { unitId: null } }),
        prisma.workOrder.deleteMany({ where: { unitId } }),
        prisma.unit.delete({ where: { id: unitId } }),
    ]);
    await deleteFiles(photoKeys);

    notifyContractorsCancelled(
        organization,
        toNotify.map((wo) => ({ ...wo, address: formatWorkOrderAddress(unit.property, unit) })),
    );

    revalidateProperty(unit.propertyId);
    revalidatePath("/work-orders");
    revalidatePath("/contacts");
    revalidatePath("/");
    return { ok: true };
}
