// Server-only. Work order edits for the MCP tools, following the office actions in src/app/(app)/work-orders/
// (actions.ts and itemActions.ts): the same editability rule, id checks, contact snapshots and Activity events.
// Every lookup is scoped to the API key's organization, and changes are attributed to the key's creator. Expected
// failures come back as { ok: false, error } instead of throwing.
import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { LineItemPriority, WorkOrderStatus } from "@/generated/prisma/client";
import { LineItemPriority as Priorities } from "@/generated/prisma/enums";
import { attachmentKeys } from "@/lib/attachments";
import prisma from "@/lib/prisma";
import { deleteFiles } from "@/lib/storage";
import { contractorSnapshot, findTenant, tenantSnapshot } from "@/lib/workOrderCreate";
import { logEvent, type Actor } from "@/lib/workOrderEvents";
import { OPEN_STATUSES } from "@/lib/workOrders";

type OfficeUser = Extract<Actor, { kind: "office" }>["user"];
type Failure = { ok: false; error: string };

const id = z.string().min(1).max(100);
const description = z.string().trim().min(1).max(1000);
const priority = z.enum(Priorities);

export const NOT_EDITABLE_ERROR =
    "Only open work orders (Draft, Sent or In progress) that aren't archived can be edited.";
const WORK_ORDER_NOT_FOUND = "No work order with that id was found.";
const AREA_NOT_FOUND = "No area with that id was found.";
const LINE_ITEM_NOT_FOUND = "No line item with that id was found.";

// Matches the page's read-only rule: only open work orders that aren't archived can change.
function notEditable(workOrder: { status: WorkOrderStatus; archived: boolean }): Failure | null {
    if (workOrder.archived || !OPEN_STATUSES.includes(workOrder.status)) {
        return { ok: false, error: NOT_EDITABLE_ERROR };
    }
    return null;
}

function officeActor(user: OfficeUser): Actor {
    return { kind: "office", user };
}

// Patch semantics: a field left out stays as it is; null clears notes, dueDate, unitId or contractorId.
// inHouse: true hands the work order to the office (it drops the contractor); a contractorId hands it back.
export const updateWorkOrderInput = z
    .object({
        id,
        title: z.string().trim().min(1).max(200).optional(),
        notes: z
            .string()
            .trim()
            .max(5000)
            .nullable()
            .transform((val) => val || null)
            .optional(),
        dueDate: z.iso.date().nullable().optional(),
        unitId: id.nullable().optional(),
        contractorId: id.nullable().optional(),
        inHouse: z.boolean().optional(),
        notifyTenant: z.boolean().optional(),
    })
    .refine(
        (input) => Object.entries(input).some(([key, value]) => key !== "id" && value !== undefined),
        "Give at least one field to change besides id.",
    )
    .refine(
        (input) => !(input.inHouse === true && input.contractorId),
        "Give a contractorId or inHouse: true, not both.",
    );

// How the assignment reads in the Activity: "In-house", the contractor's name, or null.
function assignmentName(assignment: { inHouse: boolean; contractorName: string | null }): string | null {
    return assignment.inHouse ? "In-house" : assignment.contractorName;
}

export type UpdateWorkOrderResult =
    | {
          ok: true;
          workOrder: { id: string; jobNumber: string; status: WorkOrderStatus };
          changed: string[];
          newContractorLink: boolean;
      }
    | Failure;

export async function updateWorkOrder(
    organizationId: string,
    user: OfficeUser,
    input: z.output<typeof updateWorkOrderInput>,
): Promise<UpdateWorkOrderResult> {
    const workOrder = await prisma.workOrder.findFirst({ where: { id: input.id, organizationId } });
    if (!workOrder) return { ok: false, error: WORK_ORDER_NOT_FOUND };
    const locked = notEditable(workOrder);
    if (locked) return locked;

    if (input.unitId) {
        const unit = await prisma.unit.findFirst({
            where: { id: input.unitId, propertyId: workOrder.propertyId, organizationId, archived: false },
        });
        if (!unit) return { ok: false, error: "That unit wasn't found on this work order's property." };
    }
    const contractor = input.contractorId
        ? await prisma.contact.findFirst({
              where: {
                  id: input.contractorId,
                  organizationId,
                  archived: false,
                  contactType: { in: ["CONTRACTOR", "OTHER"] },
              },
          })
        : null;
    if (input.contractorId && !contractor) return { ok: false, error: "That contractor wasn't found." };

    // Choosing a contractor ends in-house; going in-house drops the contractor.
    const inHouse = input.inHouse ?? (input.contractorId ? false : workOrder.inHouse);
    const contractorId = inHouse
        ? null
        : input.contractorId !== undefined
          ? input.contractorId
          : workOrder.contractorId;
    const contractorChanged = contractorId !== workOrder.contractorId;
    const inHouseChanged = inHouse !== workOrder.inHouse;
    const unitChanged = input.unitId !== undefined && input.unitId !== workOrder.unitId;
    const newLink = contractorChanged && workOrder.status !== "DRAFT";
    // Stored as midnight UTC, like the form and createDraftWorkOrder.
    const dueDate = input.dueDate === undefined ? undefined : input.dueDate ? new Date(input.dueDate) : null;

    await prisma.workOrder.update({
        where: { id: workOrder.id },
        data: {
            title: input.title,
            notes: input.notes,
            dueDate,
            notifyTenant: input.notifyTenant,
            inHouse,
            ...(unitChanged
                ? { unitId: input.unitId, ...tenantSnapshot(await findTenant(input.unitId ?? null, organizationId)) }
                : {}),
            ...(contractorChanged ? contractorSnapshot(contractor) : {}),
            ...(newLink ? { publicToken: randomBytes(24).toString("base64url"), deliveryMethod: null } : {}),
        },
    });

    const fields = [
        input.title !== undefined && input.title !== workOrder.title && "title",
        input.notes !== undefined && input.notes !== workOrder.notes && "notes",
        dueDate !== undefined && dueDate?.getTime() !== workOrder.dueDate?.getTime() && "dueDate",
        unitChanged && "unit",
        input.notifyTenant !== undefined && input.notifyTenant !== workOrder.notifyTenant && "notifyTenant",
    ].filter((field) => field !== false);

    // As in the office action, drafts aren't logged; edits are once the contractor has the work order.
    if (workOrder.status !== "DRAFT") {
        const event = { workOrderId: workOrder.id, organizationId, actor: officeActor(user) };
        if (fields.length > 0) await logEvent({ ...event, type: "EDITED", detail: { fields } });
        if (contractorChanged || inHouseChanged) {
            await logEvent({
                ...event,
                type: "CONTRACTOR_CHANGED",
                detail: {
                    from: assignmentName(workOrder),
                    to: assignmentName({ inHouse, contractorName: contractor?.displayName ?? null }),
                },
            });
        }
    }

    return {
        ok: true,
        workOrder: { id: workOrder.id, jobNumber: workOrder.jobNumber, status: workOrder.status },
        changed: contractorChanged || inHouseChanged ? [...fields, "contractor"] : fields,
        newContractorLink: newLink,
    };
}

export const addLineItemInput = z.object({
    workOrderId: id,
    area: z.string().trim().min(1).max(100),
    description,
    priority,
});

export type AddLineItemResult =
    { ok: true; lineItem: { id: string; areaId: string; areaName: string; areaCreated: boolean } } | Failure;

// Adds the line item to the area with that name (ignoring case), creating the area at the end if there's none.
export async function addLineItem(
    organizationId: string,
    user: OfficeUser,
    input: z.output<typeof addLineItemInput>,
): Promise<AddLineItemResult> {
    const workOrder = await prisma.workOrder.findFirst({
        where: { id: input.workOrderId, organizationId },
        include: { areas: { orderBy: { sortOrder: "asc" } } },
    });
    if (!workOrder) return { ok: false, error: WORK_ORDER_NOT_FOUND };
    const locked = notEditable(workOrder);
    if (locked) return locked;

    const logged = workOrder.status !== "DRAFT";
    const event = { workOrderId: workOrder.id, organizationId, actor: officeActor(user) };
    const wanted = input.area.toLowerCase();
    let area = workOrder.areas.find((existing) => existing.name.trim().toLowerCase() === wanted);
    const areaCreated = !area;

    if (!area) {
        const last = workOrder.areas.at(-1);
        area = await prisma.area.create({
            data: { workOrderId: workOrder.id, name: input.area, sortOrder: last ? last.sortOrder + 1 : 0 },
        });
        if (logged) await logEvent({ ...event, type: "AREA_ADDED", detail: { area: area.name } });
    }

    const lastItem = areaCreated
        ? null
        : await prisma.lineItem.findFirst({ where: { areaId: area.id }, orderBy: { sortOrder: "desc" } });
    const lineItem = await prisma.lineItem.create({
        data: {
            areaId: area.id,
            description: input.description,
            priority: input.priority,
            sortOrder: lastItem ? lastItem.sortOrder + 1 : 0,
        },
    });
    if (logged) {
        await logEvent({ ...event, type: "ITEM_ADDED", detail: { item: input.description, area: area.name } });
    }

    return { ok: true, lineItem: { id: lineItem.id, areaId: area.id, areaName: area.name, areaCreated } };
}

export const updateLineItemInput = z
    .object({ lineItemId: id, description: description.optional(), priority: priority.optional() })
    .refine(
        (input) => input.description !== undefined || input.priority !== undefined,
        "Give a description, a priority or both.",
    );

export type UpdateLineItemResult =
    { ok: true; lineItem: { id: string; description: string; priority: LineItemPriority } } | Failure;

function findLineItem(organizationId: string, lineItemId: string) {
    return prisma.lineItem.findFirst({
        where: { id: lineItemId, area: { workOrder: { organizationId } } },
        include: { area: { include: { workOrder: true } } },
    });
}

export async function updateLineItem(
    organizationId: string,
    user: OfficeUser,
    input: z.output<typeof updateLineItemInput>,
): Promise<UpdateLineItemResult> {
    const lineItem = await findLineItem(organizationId, input.lineItemId);
    if (!lineItem) return { ok: false, error: LINE_ITEM_NOT_FOUND };
    const { workOrder } = lineItem.area;
    const locked = notEditable(workOrder);
    if (locked) return locked;

    const newDescription = input.description ?? lineItem.description;
    const newPriority = input.priority ?? lineItem.priority;
    await prisma.lineItem.update({
        where: { id: lineItem.id },
        data: { description: input.description, priority: input.priority },
    });

    const descriptionChanged = newDescription !== lineItem.description;
    const priorityChanged = newPriority !== lineItem.priority;
    if (workOrder.status !== "DRAFT" && (descriptionChanged || priorityChanged)) {
        await logEvent({
            type: "ITEM_EDITED",
            workOrderId: workOrder.id,
            organizationId,
            actor: officeActor(user),
            detail: {
                item: newDescription,
                area: lineItem.area.name,
                ...(descriptionChanged ? { from: lineItem.description } : {}),
                ...(priorityChanged ? { priority: { from: lineItem.priority, to: newPriority } } : {}),
            },
        });
    }

    return { ok: true, lineItem: { id: lineItem.id, description: newDescription, priority: newPriority } };
}

export const removeLineItemInput = z.object({ lineItemId: id });

// Deletes the line item and its photos. The stored files go only after the row delete succeeds.
export async function removeLineItem(
    organizationId: string,
    user: OfficeUser,
    input: z.output<typeof removeLineItemInput>,
): Promise<{ ok: true } | Failure> {
    const lineItem = await findLineItem(organizationId, input.lineItemId);
    if (!lineItem) return { ok: false, error: LINE_ITEM_NOT_FOUND };
    const { workOrder } = lineItem.area;
    const locked = notEditable(workOrder);
    if (locked) return locked;

    const photoKeys = await attachmentKeys(organizationId, { lineItemId: lineItem.id });
    await prisma.lineItem.delete({ where: { id: lineItem.id } });
    await deleteFiles(photoKeys);
    if (workOrder.status !== "DRAFT") {
        await logEvent({
            type: "ITEM_REMOVED",
            workOrderId: workOrder.id,
            organizationId,
            actor: officeActor(user),
            detail: { item: lineItem.description, area: lineItem.area.name },
        });
    }
    return { ok: true };
}

export const removeAreaInput = z.object({ areaId: id });

// Deletes the area; its line items and their photos go with it. One event for the area, as in the office action.
export async function removeArea(
    organizationId: string,
    user: OfficeUser,
    input: z.output<typeof removeAreaInput>,
): Promise<{ ok: true } | Failure> {
    const area = await prisma.area.findFirst({
        where: { id: input.areaId, workOrder: { organizationId } },
        include: { workOrder: true },
    });
    if (!area) return { ok: false, error: AREA_NOT_FOUND };
    const locked = notEditable(area.workOrder);
    if (locked) return locked;

    const photoKeys = await attachmentKeys(organizationId, { lineItem: { areaId: area.id } });
    await prisma.area.delete({ where: { id: area.id } });
    await deleteFiles(photoKeys);
    if (area.workOrder.status !== "DRAFT") {
        await logEvent({
            type: "AREA_REMOVED",
            workOrderId: area.workOrderId,
            organizationId,
            actor: officeActor(user),
            detail: { area: area.name },
        });
    }
    return { ok: true };
}

export const renameAreaInput = z.object({ areaId: id, name: z.string().trim().min(1).max(100) });

// As the office's renameArea: logged once the contractor has the work order, and only when the name changed.
export async function renameArea(
    organizationId: string,
    user: OfficeUser,
    input: z.output<typeof renameAreaInput>,
): Promise<{ ok: true; area: { id: string; name: string } } | Failure> {
    const area = await prisma.area.findFirst({
        where: { id: input.areaId, workOrder: { organizationId } },
        include: { workOrder: true },
    });
    if (!area) return { ok: false, error: AREA_NOT_FOUND };
    const locked = notEditable(area.workOrder);
    if (locked) return locked;

    if (input.name !== area.name) {
        await prisma.area.update({ where: { id: area.id }, data: { name: input.name } });
        if (area.workOrder.status !== "DRAFT") {
            await logEvent({
                type: "AREA_RENAMED",
                workOrderId: area.workOrderId,
                organizationId,
                actor: officeActor(user),
                detail: { from: area.name, to: input.name },
            });
        }
    }
    return { ok: true, area: { id: area.id, name: input.name } };
}

// 1-based; a position past the end means last.
const position = z.number().int().min(1).max(10000);

// Where `moving` lands among `others` (both in order), as a 0-based index.
function insertAt<T>(others: T[], moving: T, wanted: number): { order: T[]; index: number } {
    const index = Math.min(wanted, others.length + 1) - 1;
    return { order: [...others.slice(0, index), moving, ...others.slice(index)], index };
}

export const moveAreaInput = z.object({ areaId: id, position });

// Moves an area to a position among its work order's areas and renumbers them all 0..n-1. Not logged, as in the app.
export async function moveArea(
    organizationId: string,
    input: z.output<typeof moveAreaInput>,
): Promise<{ ok: true; area: { id: string; position: number } } | Failure> {
    const area = await prisma.area.findFirst({
        where: { id: input.areaId, workOrder: { organizationId } },
        include: {
            workOrder: { include: { areas: { orderBy: { sortOrder: "asc" }, select: { id: true } } } },
        },
    });
    if (!area) return { ok: false, error: AREA_NOT_FOUND };
    const locked = notEditable(area.workOrder);
    if (locked) return locked;

    const others = area.workOrder.areas.filter((other) => other.id !== area.id);
    const { order, index } = insertAt(others, { id: area.id }, input.position);
    await prisma.$transaction(
        order.map((entry, i) => prisma.area.update({ where: { id: entry.id }, data: { sortOrder: i } })),
    );
    return { ok: true, area: { id: area.id, position: index + 1 } };
}

export const moveLineItemInput = z.object({ lineItemId: id, position, areaId: id.optional() });

// Moves a line item within its area, or into another area of the same work order, keeping its photos and completion.
// Renumbers the affected areas' line items 0..n-1 in one transaction. Not logged, as in the app.
export async function moveLineItem(
    organizationId: string,
    input: z.output<typeof moveLineItemInput>,
): Promise<{ ok: true; lineItem: { id: string; areaId: string; position: number } } | Failure> {
    const lineItem = await findLineItem(organizationId, input.lineItemId);
    if (!lineItem) return { ok: false, error: LINE_ITEM_NOT_FOUND };
    const { workOrder } = lineItem.area;
    const locked = notEditable(workOrder);
    if (locked) return locked;

    const targetAreaId = input.areaId ?? lineItem.areaId;
    const changingArea = targetAreaId !== lineItem.areaId;
    if (changingArea) {
        const target = await prisma.area.findFirst({ where: { id: targetAreaId, workOrderId: workOrder.id } });
        if (!target) return { ok: false, error: "That area isn't on this line item's work order." };
    }

    const inTarget = await prisma.lineItem.findMany({
        where: { areaId: targetAreaId, NOT: { id: lineItem.id } },
        orderBy: { sortOrder: "asc" },
        select: { id: true },
    });
    const { order, index } = insertAt(inTarget, { id: lineItem.id }, input.position);
    const left = changingArea
        ? await prisma.lineItem.findMany({
              where: { areaId: lineItem.areaId, NOT: { id: lineItem.id } },
              orderBy: { sortOrder: "asc" },
              select: { id: true },
          })
        : [];

    await prisma.$transaction([
        ...order.map((entry, i) =>
            prisma.lineItem.update({
                where: { id: entry.id },
                data: entry.id === lineItem.id ? { areaId: targetAreaId, sortOrder: i } : { sortOrder: i },
            }),
        ),
        ...left.map((entry, i) => prisma.lineItem.update({ where: { id: entry.id }, data: { sortOrder: i } })),
    ]);
    return { ok: true, lineItem: { id: lineItem.id, areaId: targetAreaId, position: index + 1 } };
}
