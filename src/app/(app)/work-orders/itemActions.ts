"use server";

import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { LineItemPriority, WorkOrderStatus } from "@/generated/prisma/enums";
import { z } from "zod";
import { deleteFiles } from "@/lib/storage";
import { attachmentKeys } from "@/lib/attachments";
import { logEvent } from "@/lib/workOrderEvents";
import { idInput, parseId } from "@/lib/validation";
import type { ActionResult } from "@/lib/actionResult";
import { areaNameInput, directionInput, lineItemInput } from "./schemas";
import { invalid, isEditable, NOT_EDITABLE } from "./actionHelpers";

export async function addArea(rawWorkOrderId: string, rawName: string): Promise<ActionResult> {
    const workOrderId = parseId(rawWorkOrderId);
    if (!workOrderId) throw new Error("Invalid work order");

    const result = await getCurrentUser();

    if (result.state !== "ready") {
        throw new Error("Not authorized");
    }

    const parsed = areaNameInput.safeParse(rawName);
    if (!parsed.success) return invalid(parsed.error);
    const name = parsed.data;

    const workOrder = await prisma.workOrder.findFirst({
        where: { id: workOrderId, organizationId: result.organization.id },
    });

    if (!workOrder) throw new Error("Invalid work order");
    if (!isEditable(workOrder)) return NOT_EDITABLE;

    const last = await prisma.area.findFirst({
        where: { workOrderId },
        orderBy: { sortOrder: "desc" },
    });

    const sortOrder = last ? last.sortOrder + 1 : 0;

    await prisma.area.create({
        data: {
            workOrderId,
            name,
            sortOrder,
        },
    });
    // Changes to the work are logged once the contractor has it, like other edits.
    if (workOrder.status !== "DRAFT") {
        await logEvent({
            type: "AREA_ADDED",
            workOrderId,
            organizationId: workOrder.organizationId,
            actor: { kind: "office", user: result.user },
            detail: { area: name },
        });
    }
    revalidatePath(`/work-orders/${workOrderId}`);
    return { ok: true };
}

export async function removeArea(rawAreaId: string): Promise<ActionResult> {
    const areaId = parseId(rawAreaId);
    if (!areaId) throw new Error("Invalid area");

    const result = await getCurrentUser();
    if (result.state !== "ready") throw new Error("Not authorized");

    const area = await prisma.area.findFirst({
        where: { id: areaId, workOrder: { organizationId: result.organization.id } },
        include: { workOrder: true },
    });

    if (!area) throw new Error("Invalid area");
    if (!isEditable(area.workOrder)) return NOT_EDITABLE;

    const photoKeys = await attachmentKeys(result.organization.id, { lineItem: { areaId } });
    await prisma.area.delete({ where: { id: areaId } });
    await deleteFiles(photoKeys);
    // One entry for the area; its line items aren't logged one by one.
    if (area.workOrder.status !== "DRAFT") {
        await logEvent({
            type: "AREA_REMOVED",
            workOrderId: area.workOrderId,
            organizationId: area.workOrder.organizationId,
            actor: { kind: "office", user: result.user },
            detail: { area: area.name },
        });
    }
    revalidatePath(`/work-orders/${area.workOrderId}`);
    return { ok: true };
}

export async function renameArea(rawAreaId: string, rawName: string): Promise<ActionResult> {
    const areaId = parseId(rawAreaId);
    if (!areaId) throw new Error("Invalid area");

    const result = await getCurrentUser();
    if (result.state !== "ready") throw new Error("Not authorized");

    const parsed = areaNameInput.safeParse(rawName);
    if (!parsed.success) return invalid(parsed.error);
    const name = parsed.data;

    const area = await prisma.area.findFirst({
        where: { id: areaId },
        include: { workOrder: true },
    });

    if (!area || area.workOrder.organizationId !== result.organization.id) {
        throw new Error("Invalid area");
    }
    if (!isEditable(area.workOrder)) return NOT_EDITABLE;
    if (name === area.name) return { ok: true };

    await prisma.area.update({ where: { id: area.id }, data: { name } });
    if (area.workOrder.status !== "DRAFT") {
        await logEvent({
            type: "AREA_RENAMED",
            workOrderId: area.workOrderId,
            organizationId: area.workOrder.organizationId,
            actor: { kind: "office", user: result.user },
            detail: { from: area.name, to: name },
        });
    }
    revalidatePath(`/work-orders/${area.workOrderId}`);
    return { ok: true };
}

export async function moveArea(rawAreaId: string, rawDirection: "up" | "down"): Promise<ActionResult> {
    const areaId = parseId(rawAreaId);
    if (!areaId) throw new Error("Invalid area");

    const result = await getCurrentUser();
    if (result.state !== "ready") throw new Error("Not authorized");

    const parsed = directionInput.safeParse(rawDirection);
    if (!parsed.success) return invalid(parsed.error);
    const direction = parsed.data;

    const area = await prisma.area.findFirst({
        where: { id: areaId },
        include: { workOrder: true },
    });

    if (!area || area.workOrder.organizationId !== result.organization.id) {
        throw new Error("Invalid area");
    }
    if (!isEditable(area.workOrder)) return NOT_EDITABLE;

    const neighbour = await prisma.area.findFirst({
        where: {
            workOrderId: area.workOrderId,
            sortOrder: direction === "up" ? { lt: area.sortOrder } : { gt: area.sortOrder },
        },
        orderBy: { sortOrder: direction === "up" ? "desc" : "asc" },
    });

    if (!neighbour) return { ok: true };

    await prisma.$transaction([
        prisma.area.update({
            where: { id: area.id },
            data: { sortOrder: neighbour.sortOrder },
        }),
        prisma.area.update({
            where: { id: neighbour.id },
            data: { sortOrder: area.sortOrder },
        }),
    ]);

    revalidatePath(`/work-orders/${area.workOrderId}`);
    return { ok: true };
}

export async function addLineItem(
    rawAreaId: string,
    rawDescription: string,
    rawPriority: LineItemPriority,
): Promise<ActionResult> {
    const areaId = parseId(rawAreaId);
    if (!areaId) throw new Error("Invalid area");

    const result = await getCurrentUser();
    if (result.state !== "ready") throw new Error("Not authorized");

    const parsed = lineItemInput.safeParse({ description: rawDescription, priority: rawPriority });
    if (!parsed.success) return invalid(parsed.error);
    const { description, priority } = parsed.data;

    const area = await prisma.area.findFirst({
        where: { id: areaId },
        include: { workOrder: true },
    });

    if (!area || area.workOrder.organizationId !== result.organization.id) {
        throw new Error("Invalid area");
    }
    if (!isEditable(area.workOrder)) return NOT_EDITABLE;

    const last = await prisma.lineItem.findFirst({
        where: { areaId },
        orderBy: { sortOrder: "desc" },
    });
    const sortOrder = last ? last.sortOrder + 1 : 0;

    await prisma.lineItem.create({
        data: {
            areaId,
            description,
            priority,
            sortOrder,
        },
    });
    if (area.workOrder.status !== "DRAFT") {
        await logEvent({
            type: "ITEM_ADDED",
            workOrderId: area.workOrderId,
            organizationId: area.workOrder.organizationId,
            actor: { kind: "office", user: result.user },
            detail: { item: description, area: area.name },
        });
    }
    revalidatePath(`/work-orders/${area.workOrderId}`);
    return { ok: true };
}

export async function removeLineItem(rawLineItemId: string): Promise<ActionResult> {
    const lineItemId = parseId(rawLineItemId);
    if (!lineItemId) throw new Error("Invalid line item");

    const result = await getCurrentUser();
    if (result.state !== "ready") throw new Error("Not authorized");

    const lineItem = await prisma.lineItem.findFirst({
        where: { id: lineItemId },
        include: {
            area: {
                include: { workOrder: true },
            },
        },
    });

    if (!lineItem || lineItem.area.workOrder.organizationId !== result.organization.id) {
        throw new Error("Invalid line item");
    }
    if (!isEditable(lineItem.area.workOrder)) return NOT_EDITABLE;

    const photoKeys = await attachmentKeys(result.organization.id, { lineItemId });
    await prisma.lineItem.delete({ where: { id: lineItemId } });
    await deleteFiles(photoKeys);
    if (lineItem.area.workOrder.status !== "DRAFT") {
        await logEvent({
            type: "ITEM_REMOVED",
            workOrderId: lineItem.area.workOrderId,
            organizationId: lineItem.area.workOrder.organizationId,
            actor: { kind: "office", user: result.user },
            detail: { item: lineItem.description, area: lineItem.area.name },
        });
    }
    revalidatePath(`/work-orders/${lineItem.area.workOrderId}`);
    return { ok: true };
}

export async function moveLineItem(rawLineItemId: string, rawDirection: "up" | "down"): Promise<ActionResult> {
    const lineItemId = parseId(rawLineItemId);
    if (!lineItemId) throw new Error("Invalid line item");

    const result = await getCurrentUser();
    if (result.state !== "ready") throw new Error("Not authorized");

    const parsed = directionInput.safeParse(rawDirection);
    if (!parsed.success) return invalid(parsed.error);
    const direction = parsed.data;

    const lineItem = await prisma.lineItem.findFirst({
        where: { id: lineItemId },
        include: {
            area: { include: { workOrder: true } },
        },
    });

    if (!lineItem || lineItem.area.workOrder.organizationId !== result.organization.id) {
        throw new Error("Invalid line item");
    }
    if (!isEditable(lineItem.area.workOrder)) return NOT_EDITABLE;

    const neighbour = await prisma.lineItem.findFirst({
        where: {
            areaId: lineItem.areaId,
            sortOrder: direction === "up" ? { lt: lineItem.sortOrder } : { gt: lineItem.sortOrder },
        },
        orderBy: { sortOrder: direction === "up" ? "desc" : "asc" },
    });

    if (!neighbour) return { ok: true };

    await prisma.$transaction([
        prisma.lineItem.update({
            where: { id: lineItem.id },
            data: { sortOrder: neighbour.sortOrder },
        }),
        prisma.lineItem.update({
            where: { id: neighbour.id },
            data: { sortOrder: lineItem.sortOrder },
        }),
    ]);

    revalidatePath(`/work-orders/${lineItem.area.workOrderId}`);
    return { ok: true };
}

export async function updateLineItem(
    rawLineItemId: string,
    rawDescription: string,
    rawPriority: LineItemPriority,
): Promise<ActionResult> {
    const lineItemId = parseId(rawLineItemId);
    if (!lineItemId) throw new Error("Invalid line item");

    const result = await getCurrentUser();
    if (result.state !== "ready") throw new Error("Not authorized");

    const parsed = lineItemInput.safeParse({ description: rawDescription, priority: rawPriority });
    if (!parsed.success) return invalid(parsed.error);
    const { description, priority } = parsed.data;

    const lineItem = await prisma.lineItem.findFirst({
        where: { id: lineItemId },
        include: {
            area: { include: { workOrder: true } },
        },
    });

    if (!lineItem || lineItem.area.workOrder.organizationId !== result.organization.id) {
        throw new Error("Invalid line item");
    }
    if (!isEditable(lineItem.area.workOrder)) return NOT_EDITABLE;

    await prisma.lineItem.update({
        where: { id: lineItemId },
        data: { description, priority },
    });

    const descriptionChanged = description !== lineItem.description;
    const priorityChanged = priority !== lineItem.priority;
    if (lineItem.area.workOrder.status !== "DRAFT" && (descriptionChanged || priorityChanged)) {
        await logEvent({
            type: "ITEM_EDITED",
            workOrderId: lineItem.area.workOrderId,
            organizationId: lineItem.area.workOrder.organizationId,
            actor: { kind: "office", user: result.user },
            detail: {
                item: description,
                area: lineItem.area.name,
                ...(descriptionChanged ? { from: lineItem.description } : {}),
                ...(priorityChanged ? { priority: { from: lineItem.priority, to: priority } } : {}),
            },
        });
    }

    revalidatePath(`/work-orders/${lineItem.area.workOrderId}`);
    return { ok: true };
}

const checkOffInput = z.object({ lineItemId: idInput, completed: z.boolean() });

// The office checks off line items itself on an in-house work order that has started (Sent or In progress, not
// archived). Contractor work orders are checked off from the contractor page instead.
const NOT_CHECKABLE: ActionResult = { ok: false, error: "Only started in-house work orders can be checked off here" };

export async function setLineItemCompleted(lineItemId: string, completed: boolean): Promise<ActionResult> {
    const parsed = checkOffInput.safeParse({ lineItemId, completed });
    if (!parsed.success) return invalid(parsed.error);

    const result = await getCurrentUser();
    if (result.state !== "ready") throw new Error("Not authorized");

    const input = parsed.data;
    const organizationId = result.organization.id;
    const lineItem = await prisma.lineItem.findFirst({
        where: { id: input.lineItemId, area: { workOrder: { organizationId } } },
        include: { area: { include: { workOrder: true } } },
    });
    if (!lineItem) throw new Error("Invalid line item");

    const workOrder = lineItem.area.workOrder;
    const started: WorkOrderStatus[] = ["SENT", "IN_PROGRESS"];
    const startedInHouse = { inHouse: true, archived: false, status: { in: started } };
    if (!workOrder.inHouse || workOrder.archived || !started.includes(workOrder.status)) return NOT_CHECKABLE;
    if (lineItem.completed === input.completed) return { ok: true };

    // Conditional, in case the work order was completed, cancelled or handed to a contractor since the check above.
    const updated = await prisma.lineItem.updateMany({
        where: { id: lineItem.id, area: { workOrder: { id: workOrder.id, organizationId, ...startedInHouse } } },
        data: { completed: input.completed, completedAt: input.completed ? new Date() : null },
    });
    if (updated.count === 0) return NOT_CHECKABLE;

    await logEvent({
        type: input.completed ? "ITEM_CHECKED" : "ITEM_UNCHECKED",
        workOrderId: workOrder.id,
        organizationId,
        actor: { kind: "office", user: result.user },
        detail: { item: lineItem.description, area: lineItem.area.name },
    });

    revalidatePath(`/work-orders/${workOrder.id}`);
    revalidatePath("/work-orders");
    return { ok: true };
}
