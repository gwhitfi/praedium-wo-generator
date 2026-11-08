"use server";

import { getCurrentUser } from "@/lib/auth";
import { randomBytes } from "node:crypto";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DeliveryMethod, LineItemPriority, WorkOrderStatus } from "@/generated/prisma/enums";
import { notifyContractorsCancelled } from "@/lib/emails/notifyCancelled";
import { notifyTenant } from "@/lib/emails/notifyTenant";
import { DELETE_NOT_CONFIRMED, isDeleteConfirmed } from "@/lib/confirmDelete";
import { IN_HOUSE } from "@/lib/defaults";
import { startInHouseWorkOrder } from "@/lib/workOrderStart";
import { COLOR_SECTIONS_COOKIE, formatWorkOrderAddress, OPEN_STATUSES, SPLIT_VIEW_COOKIE } from "@/lib/workOrders";
import { contractorSnapshot, findTenant, nextJobNumber, tenantSnapshot } from "@/lib/workOrderCreate";
import { z } from "zod";
import { checkPhoto, MAX_PHOTO_BYTES } from "@/lib/photos";
import { deleteFiles, lineItemPhotoKey, uploadFile } from "@/lib/storage";
import { attachmentKeys, onWorkOrders } from "@/lib/attachments";
import { logEvent } from "@/lib/workOrderEvents";
import { emailWorkOrderToContractor } from "@/lib/workOrderSend";
import { tooLong } from "@/lib/validation";

async function readWorkOrderForm(formData: FormData, organizationId: string, propertyId: string) {
    const unitId = (formData.get("unitId") as string) || null;
    // The contractor dropdown sends IN_HOUSE when the office handles the work itself.
    const contractorValue = (formData.get("contractorId") as string) || null;
    const inHouse = contractorValue === IN_HOUSE;
    const contractorId = inHouse ? null : contractorValue;
    const dueDateRaw = (formData.get("dueDate") as string) || null;

    if (unitId) {
        const unit = await prisma.unit.findFirst({
            where: { id: unitId, propertyId, organizationId, archived: false },
        });
        if (!unit) throw new Error("Invalid unit");
    }

    const contractor = contractorId
        ? await prisma.contact.findFirst({
              where: {
                  id: contractorId,
                  organizationId,
                  archived: false,
                  contactType: { in: ["CONTRACTOR", "OTHER"] },
              },
          })
        : null;
    if (contractorId && !contractor) throw new Error("Invalid contractor");

    return {
        title: formData.get("title") as string,
        notes: (formData.get("notes") as string) || null,
        notifyTenant: formData.get("tenant") === "on",
        dueDate: dueDateRaw ? new Date(dueDateRaw) : null,
        unitId,
        inHouse,
        contractor,
    };
}

// How a work order's assignment reads in the Activity: "In-house", the contractor's name, or null.
function assignmentName(assignment: { inHouse: boolean; contractorName: string | null }): string | null {
    return assignment.inHouse ? "In-house" : assignment.contractorName;
}

// Areas and line items can change only while the work order is open and not archived, matching the page's readOnly.
function assertEditable(workOrder: { status: WorkOrderStatus; archived: boolean }): void {
    if (workOrder.archived || !OPEN_STATUSES.includes(workOrder.status)) {
        throw new Error("This work order can't be edited");
    }
}

// Saves the work order list's "Split view by status" setting in a cookie, so the page renders the right view.
export async function setSplitView(enabled: boolean): Promise<void> {
    const result = await getCurrentUser();
    if (result.state !== "ready") throw new Error("Not authorized");

    const on = z.boolean().parse(enabled);
    (await cookies()).set(SPLIT_VIEW_COOKIE, on ? "1" : "0", {
        path: "/work-orders",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
    });

    revalidatePath("/work-orders");
}

// Saves the work order list's "Color sections" setting in a cookie, like setSplitView.
export async function setColorSections(enabled: boolean): Promise<void> {
    const result = await getCurrentUser();
    if (result.state !== "ready") throw new Error("Not authorized");

    const on = z.boolean().parse(enabled);
    (await cookies()).set(COLOR_SECTIONS_COOKIE, on ? "1" : "0", {
        path: "/work-orders",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
    });

    revalidatePath("/work-orders");
}

export async function createWorkOrder(formData: FormData) {
    const result = await getCurrentUser();

    if (result.state !== "ready") {
        throw new Error("Not authorized");
    }

    const organizationId = result.organization.id;
    const propertyId = formData.get("propertyId") as string;

    const property = await prisma.property.findFirst({
        where: { id: propertyId, organizationId, archived: false },
    });

    if (!property) throw new Error("Invalid property");

    const { contractor, ...fields } = await readWorkOrderForm(formData, organizationId, propertyId);
    const tenant = await findTenant(fields.unitId, organizationId);

    const workOrder = await prisma.$transaction(async (tx) =>
        tx.workOrder.create({
            data: {
                organizationId,
                jobNumber: await nextJobNumber(tx, organizationId),
                publicToken: randomBytes(24).toString("base64url"),
                propertyId,
                ...fields,
                status: "DRAFT",
                ...contractorSnapshot(contractor),
                ...tenantSnapshot(tenant),
            },
        }),
    );

    await logEvent({
        type: "CREATED",
        workOrderId: workOrder.id,
        organizationId,
        actor: { kind: "office", user: result.user },
        detail: { source: "form" },
    });

    revalidatePath("/work-orders");
    redirect(`/work-orders/${workOrder.id}`);
}

export async function updateWorkOrder(workOrderId: string, formData: FormData) {
    const result = await getCurrentUser();
    if (result.state !== "ready") throw new Error("Not authorized");

    const organizationId = result.organization.id;
    const workOrder = await prisma.workOrder.findFirst({
        where: { id: workOrderId, organizationId, archived: false },
    });

    if (!workOrder) throw new Error("Invalid work order");
    if (!["DRAFT", "SENT", "IN_PROGRESS"].includes(workOrder.status)) {
        throw new Error("Only open work orders can be edited");
    }

    const { contractor, ...fields } = await readWorkOrderForm(formData, organizationId, workOrder.propertyId);
    const contractorChanged = (contractor?.id ?? null) !== workOrder.contractorId;
    const inHouseChanged = fields.inHouse !== workOrder.inHouse;
    const unitChanged = fields.unitId !== workOrder.unitId;
    const newLink = contractorChanged && workOrder.status !== "DRAFT";

    await prisma.workOrder.update({
        where: { id: workOrderId },
        data: {
            ...fields,
            ...(contractorChanged ? contractorSnapshot(contractor) : {}),
            ...(unitChanged ? tenantSnapshot(await findTenant(fields.unitId, organizationId)) : {}),
            ...(newLink ? { publicToken: randomBytes(24).toString("base64url"), deliveryMethod: null } : {}),
        },
    });

    // Drafts change too often to be worth a history entry; edits are logged once the contractor has it.
    if (workOrder.status !== "DRAFT") {
        const event = { workOrderId, organizationId, actor: { kind: "office" as const, user: result.user } };
        const changed = [
            fields.title !== workOrder.title && "title",
            fields.notes !== workOrder.notes && "notes",
            fields.dueDate?.getTime() !== workOrder.dueDate?.getTime() && "dueDate",
            unitChanged && "unit",
            fields.notifyTenant !== workOrder.notifyTenant && "notifyTenant",
        ].filter((field) => field !== false);

        if (changed.length > 0) await logEvent({ ...event, type: "EDITED", detail: { fields: changed } });
        if (contractorChanged || inHouseChanged) {
            await logEvent({
                ...event,
                type: "CONTRACTOR_CHANGED",
                detail: {
                    from: assignmentName(workOrder),
                    to: assignmentName({ inHouse: fields.inHouse, contractorName: contractor?.displayName ?? null }),
                },
            });
        }
    }

    revalidatePath(`/work-orders/${workOrderId}`);
    revalidatePath("/work-orders");
    if (newLink || inHouseChanged) revalidatePath(`/wo/${workOrder.publicToken}`);
    redirect(`/work-orders/${workOrderId}${newLink && contractor ? "?contractorChanged=1" : ""}`);
}

export async function archiveWorkOrder(workOrderId: string) {
    const result = await getCurrentUser();
    if (result.state !== "ready") throw new Error("Not authorized");

    const workOrder = await prisma.workOrder.findFirst({
        where: { id: workOrderId, organizationId: result.organization.id },
        include: { property: true, unit: true },
    });
    if (!workOrder) throw new Error("Invalid work order");

    const willCancel = !workOrder.archived && (workOrder.status === "SENT" || workOrder.status === "IN_PROGRESS");

    await prisma.workOrder.update({
        where: { id: workOrderId },
        data: willCancel ? { archived: true, status: "CANCELLED", cancelledAt: new Date() } : { archived: true },
    });

    const event = {
        workOrderId,
        organizationId: workOrder.organizationId,
        actor: { kind: "office" as const, user: result.user },
    };
    if (willCancel) await logEvent({ ...event, type: "CANCELLED", detail: { reason: "Archived" } });
    await logEvent({ ...event, type: "ARCHIVED" });

    if (willCancel) {
        notifyContractorsCancelled(result.organization, [
            { ...workOrder, address: formatWorkOrderAddress(workOrder.property, workOrder.unit) },
        ]);
    }

    revalidatePath("/work-orders");
    revalidatePath(`/work-orders/${workOrderId}`);
    revalidatePath(`/wo/${workOrder.publicToken}`);
    revalidatePath("/");
    redirect("/work-orders");
}

export async function restoreWorkOrder(workOrderId: string): Promise<{ ok: true } | { ok: false; error: string }> {
    const result = await getCurrentUser();
    if (result.state !== "ready") return { ok: false, error: "Not authorized" };

    const workOrder = await prisma.workOrder.findFirst({
        where: { id: workOrderId, organizationId: result.organization.id },
        include: { property: { select: { archived: true } } },
    });
    if (!workOrder) return { ok: false, error: "Work order not found" };
    if (workOrder.property.archived) {
        return { ok: false, error: "This work order's property is archived. Restore the property first." };
    }

    await prisma.workOrder.update({ where: { id: workOrderId }, data: { archived: false } });
    await logEvent({
        type: "RESTORED",
        workOrderId,
        organizationId: workOrder.organizationId,
        actor: { kind: "office", user: result.user },
    });

    revalidatePath("/work-orders");
    revalidatePath(`/work-orders/${workOrderId}`);
    revalidatePath(`/wo/${workOrder.publicToken}`);
    return { ok: true };
}

export async function deleteWorkOrder(
    workOrderId: string,
    confirmation: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!isDeleteConfirmed(confirmation)) return DELETE_NOT_CONFIRMED;

    const result = await getCurrentUser();
    if (result.state !== "ready") return { ok: false, error: "Not authorized" };

    const workOrder = await prisma.workOrder.findFirst({
        where: { id: workOrderId, organizationId: result.organization.id },
        include: { property: true, unit: true },
    });
    if (!workOrder) return { ok: false, error: "Work order not found" };

    // Areas, line items and attachments cascade; their stored files are deleted afterwards.
    const photoKeys = await attachmentKeys(result.organization.id, onWorkOrders({ id: workOrderId }));
    await prisma.workOrder.delete({ where: { id: workOrderId } });
    await deleteFiles(photoKeys);

    if (!workOrder.archived && ["SENT", "IN_PROGRESS"].includes(workOrder.status)) {
        notifyContractorsCancelled(result.organization, [
            { ...workOrder, address: formatWorkOrderAddress(workOrder.property, workOrder.unit) },
        ]);
    }

    revalidatePath("/work-orders");
    revalidatePath(`/properties/${workOrder.propertyId}`);
    revalidatePath(`/wo/${workOrder.publicToken}`);
    revalidatePath("/");
    redirect("/work-orders");
}

export async function addArea(workOrderId: string, name: string) {
    const result = await getCurrentUser();

    if (result.state !== "ready") {
        throw new Error("Not authorized");
    }

    const workOrder = await prisma.workOrder.findFirst({
        where: { id: workOrderId, organizationId: result.organization.id },
    });

    if (!workOrder) throw new Error("Invalid work order");
    assertEditable(workOrder);

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
}

export async function removeArea(areaId: string) {
    const result = await getCurrentUser();
    if (result.state !== "ready") throw new Error("Not authorized");

    const area = await prisma.area.findFirst({
        where: { id: areaId },
        include: { workOrder: true },
    });

    if (!area || area.workOrder.organizationId !== result.organization.id) {
        throw new Error("Invalid area");
    }
    assertEditable(area.workOrder);

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
}

const areaNameInput = z.string().trim().min(1, "Enter an area name").max(100, tooLong(100));

export async function renameArea(areaId: string, rawName: string): Promise<void> {
    const result = await getCurrentUser();
    if (result.state !== "ready") throw new Error("Not authorized");

    const parsed = areaNameInput.safeParse(rawName);
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    const name = parsed.data;

    const area = await prisma.area.findFirst({
        where: { id: areaId },
        include: { workOrder: true },
    });

    if (!area || area.workOrder.organizationId !== result.organization.id) {
        throw new Error("Invalid area");
    }
    assertEditable(area.workOrder);
    if (name === area.name) return;

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
}

export async function moveArea(areaId: string, direction: "up" | "down") {
    const result = await getCurrentUser();
    if (result.state !== "ready") throw new Error("Not authorized");

    const area = await prisma.area.findFirst({
        where: { id: areaId },
        include: { workOrder: true },
    });

    if (!area || area.workOrder.organizationId !== result.organization.id) {
        throw new Error("Invalid area");
    }
    assertEditable(area.workOrder);

    const neighbour = await prisma.area.findFirst({
        where: {
            workOrderId: area.workOrderId,
            sortOrder: direction === "up" ? { lt: area.sortOrder } : { gt: area.sortOrder },
        },
        orderBy: { sortOrder: direction === "up" ? "desc" : "asc" },
    });

    if (!neighbour) return;

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
}

export async function addLineItem(areaId: string, description: string, priority: LineItemPriority) {
    const result = await getCurrentUser();
    if (result.state !== "ready") throw new Error("Not authorized");

    const area = await prisma.area.findFirst({
        where: { id: areaId },
        include: { workOrder: true },
    });

    if (!area || area.workOrder.organizationId !== result.organization.id) {
        throw new Error("Invalid area");
    }
    assertEditable(area.workOrder);

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
}

export async function removeLineItem(lineItemId: string) {
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
    assertEditable(lineItem.area.workOrder);

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
}

export async function moveLineItem(lineItemId: string, direction: "up" | "down") {
    const result = await getCurrentUser();
    if (result.state !== "ready") throw new Error("Not authorized");

    const lineItem = await prisma.lineItem.findFirst({
        where: { id: lineItemId },
        include: {
            area: { include: { workOrder: true } },
        },
    });

    if (!lineItem || lineItem.area.workOrder.organizationId !== result.organization.id) {
        throw new Error("Invalid line item");
    }
    assertEditable(lineItem.area.workOrder);

    const neighbour = await prisma.lineItem.findFirst({
        where: {
            areaId: lineItem.areaId,
            sortOrder: direction === "up" ? { lt: lineItem.sortOrder } : { gt: lineItem.sortOrder },
        },
        orderBy: { sortOrder: direction === "up" ? "desc" : "asc" },
    });

    if (!neighbour) return;

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
}

export async function updateLineItem(lineItemId: string, description: string, priority: LineItemPriority) {
    const result = await getCurrentUser();
    if (result.state !== "ready") throw new Error("Not authorized");

    const lineItem = await prisma.lineItem.findFirst({
        where: { id: lineItemId },
        include: {
            area: { include: { workOrder: true } },
        },
    });

    if (!lineItem || lineItem.area.workOrder.organizationId !== result.organization.id) {
        throw new Error("Invalid line item");
    }
    assertEditable(lineItem.area.workOrder);

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
}

type PhotoResult = { ok: true } | { ok: false; error: string };

const lineItemIdInput = z.string().min(1).max(100);
const photoInput = z.instanceof(File, { message: "Choose a photo." });

type PhotoLineItem =
    | { ok: true; id: string; item: string; area: string; workOrder: { id: string; publicToken: string } }
    | { ok: false; error: string };

// Photos can change only while the work order itself can be edited.
async function findPhotoLineItem(lineItemId: unknown, organizationId: string): Promise<PhotoLineItem> {
    const id = lineItemIdInput.safeParse(lineItemId);
    if (!id.success) return { ok: false, error: "Line item not found." };

    const lineItem = await prisma.lineItem.findFirst({
        where: { id: id.data, area: { workOrder: { organizationId } } },
        select: { id: true, description: true, area: { select: { name: true, workOrder: true } } },
    });
    if (!lineItem) return { ok: false, error: "Line item not found." };

    const workOrder = lineItem.area.workOrder;
    if (workOrder.archived || !OPEN_STATUSES.includes(workOrder.status)) {
        return { ok: false, error: "Photos can only be changed on open work orders." };
    }

    return {
        ok: true,
        id: lineItem.id,
        item: lineItem.description,
        area: lineItem.area.name,
        workOrder: { id: workOrder.id, publicToken: workOrder.publicToken },
    };
}

function revalidatePhoto(workOrder: { id: string; publicToken: string }) {
    revalidatePath(`/work-orders/${workOrder.id}`);
    revalidatePath(`/wo/${workOrder.publicToken}`);
}

// Adds the line item's photo, replacing the one it already has.
export async function setLineItemPhoto(lineItemId: string, formData: FormData): Promise<PhotoResult> {
    const result = await getCurrentUser();
    if (result.state !== "ready") return { ok: false, error: "Not authorized" };
    const organizationId = result.organization.id;

    const lineItem = await findPhotoLineItem(lineItemId, organizationId);
    if (!lineItem.ok) return lineItem;

    const file = photoInput.safeParse(formData.get("photo"));
    if (!file.success) return { ok: false, error: "Choose a photo." };
    if (file.data.size > MAX_PHOTO_BYTES) return { ok: false, error: "Photos must be 3 MB or smaller." };

    const bytes = new Uint8Array(await file.data.arrayBuffer());
    const photo = checkPhoto(bytes);
    if (!photo.ok) return photo;

    const storageKey = lineItemPhotoKey(organizationId, lineItem.id, photo.type);
    try {
        await uploadFile(storageKey, bytes, photo.type.mimeType);
    } catch (error) {
        console.error("setLineItemPhoto upload failed", error);
        return { ok: false, error: "The photo couldn't be uploaded. Try again." };
    }

    let replacedKeys: string[];
    try {
        replacedKeys = await prisma.$transaction(async (tx) => {
            const existing = await tx.attachment.findMany({
                where: { lineItemId: lineItem.id, organizationId },
                select: { storageKey: true },
            });
            await tx.attachment.deleteMany({ where: { lineItemId: lineItem.id, organizationId } });
            await tx.attachment.create({
                data: {
                    organizationId,
                    lineItemId: lineItem.id,
                    storageKey,
                    fileName: file.data.name.slice(0, 255) || null,
                    mimeType: photo.type.mimeType,
                    sizeBytes: bytes.length,
                },
            });
            return existing.map((a) => a.storageKey);
        });
    } catch (error) {
        console.error("setLineItemPhoto save failed", error);
        await deleteFiles([storageKey]);
        return { ok: false, error: "The photo couldn't be saved. Try again." };
    }

    await deleteFiles(replacedKeys);
    await logEvent({
        type: "PHOTO_ADDED",
        workOrderId: lineItem.workOrder.id,
        organizationId,
        actor: { kind: "office", user: result.user },
        detail: { item: lineItem.item, area: lineItem.area },
    });
    revalidatePhoto(lineItem.workOrder);
    return { ok: true };
}

export async function removeLineItemPhoto(lineItemId: string): Promise<PhotoResult> {
    const result = await getCurrentUser();
    if (result.state !== "ready") return { ok: false, error: "Not authorized" };
    const organizationId = result.organization.id;

    const lineItem = await findPhotoLineItem(lineItemId, organizationId);
    if (!lineItem.ok) return lineItem;

    const removedKeys = await prisma.$transaction(async (tx) => {
        const existing = await tx.attachment.findMany({
            where: { lineItemId: lineItem.id, organizationId },
            select: { storageKey: true },
        });
        await tx.attachment.deleteMany({ where: { lineItemId: lineItem.id, organizationId } });
        return existing.map((a) => a.storageKey);
    });

    await deleteFiles(removedKeys);
    if (removedKeys.length > 0) {
        await logEvent({
            type: "PHOTO_REMOVED",
            workOrderId: lineItem.workOrder.id,
            organizationId,
            actor: { kind: "office", user: result.user },
            detail: { item: lineItem.item, area: lineItem.area },
        });
    }
    revalidatePhoto(lineItem.workOrder);
    return { ok: true };
}

export async function sendWorkOrder(workOrderId: string, deliveryMethod: DeliveryMethod) {
    const result = await getCurrentUser();
    if (result.state !== "ready") throw new Error("Not authorized");

    const workOrder = await prisma.workOrder.findFirst({
        where: { id: workOrderId, organizationId: result.organization.id },
        include: { contractor: true, property: true, unit: true },
    });

    if (!workOrder) throw new Error("Invalid work order");
    if (workOrder.inHouse) throw new Error("In-house work orders are started, not sent");
    if (!workOrder.contractorId) throw new Error("Assign a contractor before sending");
    if (workOrder.archived) throw new Error("Archived work orders can't be sent");
    if (workOrder.status !== "DRAFT") throw new Error("Only draft work orders can be marked as sent");

    await prisma.workOrder.update({
        where: { id: workOrderId },
        data: {
            status: "SENT",
            sentAt: new Date(),
            deliveryMethod,
            contractorName: workOrder.contractor?.displayName ?? null,
            contractorPhone: workOrder.contractor?.phone ?? null,
            contractorEmail: workOrder.contractor?.email ?? null,
        },
    });
    const tenantNotified =
        !!workOrder.contractor &&
        notifyTenant(result.organization, {
            ...workOrder,
            address: formatWorkOrderAddress(workOrder.property, workOrder.unit),
            contractor: workOrder.contractor,
        });
    await logEvent({
        type: "SENT",
        workOrderId,
        organizationId: workOrder.organizationId,
        actor: { kind: "office", user: result.user },
        detail: { deliveryMethod, resent: false, ...(tenantNotified ? { tenantNotified: true } : {}) },
    });

    revalidatePath(`/work-orders/${workOrderId}`);
    revalidatePath("/work-orders");
}

type EmailResult = { ok: true; to: string } | { ok: false; error: string };

export async function emailWorkOrder(workOrderId: string): Promise<EmailResult> {
    const result = await getCurrentUser();
    if (result.state !== "ready") return { ok: false, error: "Not authorized" };

    const sent = await emailWorkOrderToContractor({
        organizationId: result.organization.id,
        organization: result.organization,
        user: result.user,
        workOrderId,
    });
    if (!sent.ok) return sent;

    revalidatePath(`/work-orders/${workOrderId}`);
    revalidatePath("/work-orders");
    return { ok: true, to: sent.to };
}

// "Start work" on an in-house draft: it moves to In progress without sending anything to a contractor.
export async function startWorkOrder(workOrderId: string): Promise<{ ok: true } | { ok: false; error: string }> {
    const result = await getCurrentUser();
    if (result.state !== "ready") return { ok: false, error: "Not authorized" };

    const id = z.string().min(1).max(100).safeParse(workOrderId);
    if (!id.success) return { ok: false, error: "Work order not found" };

    const started = await startInHouseWorkOrder({
        organizationId: result.organization.id,
        organization: result.organization,
        user: result.user,
        workOrderId: id.data,
    });
    if (!started.ok) return started;

    revalidatePath(`/work-orders/${id.data}`);
    revalidatePath("/work-orders");
    revalidatePath("/");
    return { ok: true };
}

const checkOffInput = z.object({ lineItemId: z.string().min(1).max(100), completed: z.boolean() });

// The office checks off line items itself on an in-house work order that has started (Sent or In progress, not
// archived). Contractor work orders are checked off from the contractor page instead.
export async function setLineItemCompleted(lineItemId: string, completed: boolean): Promise<void> {
    const result = await getCurrentUser();
    if (result.state !== "ready") throw new Error("Not authorized");

    const input = checkOffInput.parse({ lineItemId, completed });
    const organizationId = result.organization.id;
    const lineItem = await prisma.lineItem.findFirst({
        where: { id: input.lineItemId, area: { workOrder: { organizationId } } },
        include: { area: { include: { workOrder: true } } },
    });
    if (!lineItem) throw new Error("Invalid line item");

    const workOrder = lineItem.area.workOrder;
    const started: WorkOrderStatus[] = ["SENT", "IN_PROGRESS"];
    const startedInHouse = { inHouse: true, archived: false, status: { in: started } };
    if (!workOrder.inHouse || workOrder.archived || !started.includes(workOrder.status)) {
        throw new Error("Only started in-house work orders can be checked off here");
    }
    if (lineItem.completed === input.completed) return;

    // Conditional, in case the work order was completed, cancelled or handed to a contractor since the check above.
    const updated = await prisma.lineItem.updateMany({
        where: { id: lineItem.id, area: { workOrder: { id: workOrder.id, organizationId, ...startedInHouse } } },
        data: { completed: input.completed, completedAt: input.completed ? new Date() : null },
    });
    if (updated.count === 0) throw new Error("Only started in-house work orders can be checked off here");

    await logEvent({
        type: input.completed ? "ITEM_CHECKED" : "ITEM_UNCHECKED",
        workOrderId: workOrder.id,
        organizationId,
        actor: { kind: "office", user: result.user },
        detail: { item: lineItem.description, area: lineItem.area.name },
    });

    revalidatePath(`/work-orders/${workOrder.id}`);
    revalidatePath("/work-orders");
}

export async function markWorkOrderCompleted(workOrderId: string) {
    const result = await getCurrentUser();
    if (result.state !== "ready") throw new Error("Not authorized");

    const workOrder = await prisma.workOrder.findFirst({
        where: { id: workOrderId, organizationId: result.organization.id },
    });

    if (!workOrder) throw new Error("Invalid work order");

    await prisma.workOrder.update({
        where: { id: workOrderId },
        data: {
            status: "COMPLETED",
            completedAt: new Date(),
        },
    });
    await logEvent({
        type: "COMPLETED_BY_OFFICE",
        workOrderId,
        organizationId: workOrder.organizationId,
        actor: { kind: "office", user: result.user },
    });

    revalidatePath(`/work-orders/${workOrderId}`);
    revalidatePath("/work-orders");
}

export async function reopenWorkOrder(workOrderId: string) {
    const result = await getCurrentUser();
    if (result.state !== "ready") throw new Error("Not authorized");

    const workOrder = await prisma.workOrder.findFirst({
        where: { id: workOrderId, organizationId: result.organization.id },
    });

    if (!workOrder) throw new Error("Invalid work order");

    await prisma.workOrder.update({
        where: { id: workOrderId },
        data: {
            // A started in-house work order goes back to In progress, since it's never sent.
            status: workOrder.sentAt ? "SENT" : workOrder.startedAt ? "IN_PROGRESS" : "DRAFT",
            closedAt: null,
            completedAt: null,
            cancelledAt: null,
            cancelReason: null,
        },
    });
    await logEvent({
        type: "REOPENED",
        workOrderId,
        organizationId: workOrder.organizationId,
        actor: { kind: "office", user: result.user },
    });

    revalidatePath(`/work-orders/${workOrderId}`);
    revalidatePath("/work-orders");
}

export async function closeWorkOrder(workOrderId: string) {
    const result = await getCurrentUser();
    if (result.state !== "ready") throw new Error("Not authorized");

    const workOrder = await prisma.workOrder.findFirst({
        where: { id: workOrderId, organizationId: result.organization.id },
    });

    if (!workOrder) throw new Error("Invalid work order");
    if (workOrder.status !== "COMPLETED") throw new Error("Only completed work orders can be closed");

    await prisma.workOrder.update({
        where: { id: workOrderId },
        data: {
            status: "CLOSED",
            closedAt: new Date(),
        },
    });
    await logEvent({
        type: "CLOSED",
        workOrderId,
        organizationId: workOrder.organizationId,
        actor: { kind: "office", user: result.user },
    });

    revalidatePath(`/work-orders/${workOrderId}`);
    revalidatePath("/work-orders");
}

const cancelReasonInput = z
    .string()
    .trim()
    .max(500, tooLong(500))
    .optional()
    .transform((val) => val || null);

export async function cancelWorkOrder(workOrderId: string, rawReason?: string) {
    const result = await getCurrentUser();
    if (result.state !== "ready") throw new Error("Not authorized");

    const parsed = cancelReasonInput.safeParse(rawReason);
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    const reason = parsed.data;

    const workOrder = await prisma.workOrder.findFirst({
        where: { id: workOrderId, organizationId: result.organization.id },
        include: { property: true, unit: true },
    });

    if (!workOrder) throw new Error("Invalid work order");
    if (workOrder.status !== "SENT" && workOrder.status !== "IN_PROGRESS") {
        throw new Error("Only sent or in-progress work orders can be cancelled");
    }

    await prisma.workOrder.update({
        where: { id: workOrderId },
        data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason },
    });
    await logEvent({
        type: "CANCELLED",
        workOrderId,
        organizationId: workOrder.organizationId,
        actor: { kind: "office", user: result.user },
        detail: { reason },
    });

    if (!workOrder.archived) {
        notifyContractorsCancelled(result.organization, [
            { ...workOrder, address: formatWorkOrderAddress(workOrder.property, workOrder.unit) },
        ]);
    }

    revalidatePath(`/work-orders/${workOrderId}`);
    revalidatePath("/work-orders");
    revalidatePath(`/wo/${workOrder.publicToken}`);
    revalidatePath("/");
}

export async function regeneratePublicToken(workOrderId: string) {
    const result = await getCurrentUser();
    if (result.state !== "ready") throw new Error("Not authorized");

    const workOrder = await prisma.workOrder.findFirst({
        where: { id: workOrderId, organizationId: result.organization.id },
    });

    if (!workOrder) throw new Error("Invalid work order");
    if (workOrder.inHouse) throw new Error("In-house work orders have no contractor link");

    await prisma.workOrder.update({
        where: { id: workOrderId },
        data: { publicToken: randomBytes(24).toString("base64url") },
    });
    await logEvent({
        type: "EDITED",
        workOrderId,
        organizationId: workOrder.organizationId,
        actor: { kind: "office", user: result.user },
        detail: { fields: ["link"] },
    });

    revalidatePath(`/work-orders/${workOrderId}`);
    revalidatePath(`/wo/${workOrder.publicToken}`);
}
