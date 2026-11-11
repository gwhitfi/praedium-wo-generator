"use server";

import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { OPEN_STATUSES } from "@/lib/workOrders";
import { z } from "zod";
import { checkPhoto, MAX_LINE_ITEM_PHOTOS, MAX_PHOTO_BYTES } from "@/lib/photos";
import { deleteFiles, lineItemPhotoKey, uploadFile } from "@/lib/storage";
import { logEvent } from "@/lib/workOrderEvents";
import { parseId } from "@/lib/validation";

type PhotoResult = { ok: true } | { ok: false; error: string };

const photoInput = z.instanceof(File, { message: "Choose a photo." });

type PhotoLineItem =
    | { ok: true; id: string; item: string; area: string; workOrder: { id: string; publicToken: string } }
    | { ok: false; error: string };

// Photos can change only while the work order itself can be edited.
async function findPhotoLineItem(lineItemId: string, organizationId: string): Promise<PhotoLineItem> {
    const lineItem = await prisma.lineItem.findFirst({
        where: { id: lineItemId, area: { workOrder: { organizationId } } },
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

const PHOTO_LIMIT_ERROR = `A line item can have up to ${MAX_LINE_ITEM_PHOTOS} photos.`;

// Adds a photo to the line item, up to MAX_LINE_ITEM_PHOTOS.
export async function addLineItemPhoto(rawLineItemId: string, formData: FormData): Promise<PhotoResult> {
    const lineItemId = parseId(rawLineItemId);
    if (!lineItemId) return { ok: false, error: "Line item not found." };

    const result = await getCurrentUser();
    if (result.state !== "ready") return { ok: false, error: "Not authorized" };
    const organizationId = result.organization.id;

    const lineItem = await findPhotoLineItem(lineItemId, organizationId);
    if (!lineItem.ok) return lineItem;

    // Saves an upload when the item is already full; the transaction below checks again.
    const photoCount = await prisma.attachment.count({ where: { lineItemId: lineItem.id, organizationId } });
    if (photoCount >= MAX_LINE_ITEM_PHOTOS) return { ok: false, error: PHOTO_LIMIT_ERROR };

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
        console.error("addLineItemPhoto upload failed", error);
        return { ok: false, error: "The photo couldn't be uploaded. Try again." };
    }

    let saved: boolean;
    try {
        saved = await prisma.$transaction(async (tx) => {
            // Locks the line item row so two uploads at the same moment can't both pass the count.
            await tx.$queryRaw`SELECT "id" FROM "LineItem" WHERE "id" = ${lineItem.id} FOR UPDATE`;
            const count = await tx.attachment.count({ where: { lineItemId: lineItem.id, organizationId } });
            if (count >= MAX_LINE_ITEM_PHOTOS) return false;
            await tx.attachment.create({
                data: {
                    organizationId,
                    lineItemId: lineItem.id,
                    storageKey,
                    fileName: file.data.name.slice(0, 255) || null,
                    mimeType: photo.type.mimeType,
                    sizeBytes: bytes.length,
                    sortOrder: count,
                },
            });
            return true;
        });
    } catch (error) {
        console.error("addLineItemPhoto save failed", error);
        await deleteFiles([storageKey]);
        return { ok: false, error: "The photo couldn't be saved. Try again." };
    }
    if (!saved) {
        await deleteFiles([storageKey]);
        return { ok: false, error: PHOTO_LIMIT_ERROR };
    }

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

// Removes one photo from a line item.
export async function removeLineItemPhoto(rawAttachmentId: string): Promise<PhotoResult> {
    const attachmentId = parseId(rawAttachmentId);
    if (!attachmentId) return { ok: false, error: "Photo not found." };

    const result = await getCurrentUser();
    if (result.state !== "ready") return { ok: false, error: "Not authorized" };
    const organizationId = result.organization.id;

    const attachment = await prisma.attachment.findFirst({
        where: { id: attachmentId, organizationId, lineItemId: { not: null } },
        select: { id: true, lineItemId: true, storageKey: true },
    });
    if (!attachment?.lineItemId) return { ok: false, error: "Photo not found." };

    const lineItem = await findPhotoLineItem(attachment.lineItemId, organizationId);
    if (!lineItem.ok) return lineItem;

    const { count } = await prisma.attachment.deleteMany({ where: { id: attachment.id, organizationId } });

    if (count > 0) {
        await deleteFiles([attachment.storageKey]);
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
