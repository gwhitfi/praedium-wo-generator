"use server";

import { getCurrentUser } from "@/lib/auth";
import { randomBytes } from "node:crypto";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { notifyContractorsCancelled } from "@/lib/emails/notifyCancelled";
import { DELETE_NOT_CONFIRMED, isDeleteConfirmed } from "@/lib/confirmDelete";
import { formatWorkOrderAddress } from "@/lib/workOrders";
import { contractorSnapshot, findTenant, nextJobNumber, tenantSnapshot } from "@/lib/workOrderCreate";
import { z } from "zod";
import { deleteFiles } from "@/lib/storage";
import { attachmentKeys, onWorkOrders } from "@/lib/attachments";
import { logEvent } from "@/lib/workOrderEvents";
import { parseId } from "@/lib/validation";
import {
    firstItemInput,
    readFirstItemFormData,
    readWorkOrderFormData,
    submittedValues,
    workOrderFormInput,
    type WorkOrderFormFields,
    type WorkOrderFormState,
} from "./schemas";

type ContractorContact = NonNullable<Awaited<ReturnType<typeof prisma.contact.findFirst>>>;

type ReadForm =
    | {
          ok: true;
          fields: Omit<WorkOrderFormFields, "propertyId" | "contractorId">;
          contractor: ContractorContact | null;
      }
    | { ok: false; state: WorkOrderFormState };

// Validates the work order form with Zod, then checks that the unit and contractor belong to this organization
// (and the unit to `propertyId`). Problems come back as field errors so the form can show them in place.
async function readWorkOrderForm(formData: FormData, organizationId: string, propertyId: string): Promise<ReadForm> {
    const values = submittedValues(formData);
    const parsed = workOrderFormInput.safeParse(readWorkOrderFormData(formData));
    if (!parsed.success) {
        return { ok: false, state: { errors: z.flattenError(parsed.error).fieldErrors, values } };
    }
    const { title, unitId, notes, dueDate, notifyTenant, inHouse, contractorId } = parsed.data;
    const fields = { title, unitId, notes, dueDate, notifyTenant, inHouse };

    if (fields.unitId) {
        const unit = await prisma.unit.findFirst({
            where: { id: fields.unitId, propertyId, organizationId, archived: false },
        });
        if (!unit) return { ok: false, state: { errors: { unitId: ["Choose a unit at this property"] }, values } };
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
    if (contractorId && !contractor) {
        return { ok: false, state: { errors: { contractorId: ["That contractor is no longer available"] }, values } };
    }

    return { ok: true, fields, contractor };
}

// How a work order's assignment reads in the Activity: "In-house", the contractor's name, or null.
function assignmentName(assignment: { inHouse: boolean; contractorName: string | null }): string | null {
    return assignment.inHouse ? "In-house" : assignment.contractorName;
}

export async function createWorkOrder(
    prevState: WorkOrderFormState,
    formData: FormData,
): Promise<WorkOrderFormState> {
    const result = await getCurrentUser();

    if (result.state !== "ready") {
        throw new Error("Not authorized");
    }

    const organizationId = result.organization.id;
    const rawPropertyId = formData.get("propertyId");
    const propertyId = typeof rawPropertyId === "string" ? rawPropertyId.trim() : "";

    const property = propertyId
        ? await prisma.property.findFirst({
              where: { id: propertyId, organizationId, archived: false },
          })
        : null;

    const form = await readWorkOrderForm(formData, organizationId, propertyId);
    // The optional first area and item (a one-line job), checked along with the rest so all errors show at once.
    const first = firstItemInput.safeParse(readFirstItemFormData(formData));
    const firstErrors = first.success ? {} : z.flattenError(first.error).fieldErrors;
    if (!property || !form.ok || !first.success) {
        const state = form.ok ? { values: submittedValues(formData) } : form.state;
        return {
            ...state,
            errors: {
                ...state.errors,
                ...firstErrors,
                ...(property ? {} : { propertyId: ["Choose a property"] }),
            },
        };
    }

    const { contractor, fields } = form;
    const firstItem = first.data;
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
                ...(firstItem && {
                    areas: {
                        create: {
                            name: firstItem.areaName,
                            sortOrder: 0,
                            ...(firstItem.item && {
                                lineItems: { create: { ...firstItem.item, sortOrder: 0 } },
                            }),
                        },
                    },
                }),
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
    redirect(`/work-orders/${workOrder.id}?flash=work-order-created`);
}

export async function updateWorkOrder(
    rawWorkOrderId: string,
    prevState: WorkOrderFormState,
    formData: FormData,
): Promise<WorkOrderFormState> {
    const workOrderId = parseId(rawWorkOrderId);
    if (!workOrderId) throw new Error("Invalid work order");

    const result = await getCurrentUser();
    if (result.state !== "ready") throw new Error("Not authorized");

    const organizationId = result.organization.id;
    const workOrder = await prisma.workOrder.findFirst({
        where: { id: workOrderId, organizationId, archived: false },
    });

    if (!workOrder) throw new Error("Invalid work order");
    if (!["DRAFT", "SENT", "IN_PROGRESS"].includes(workOrder.status)) {
        return {
            error: "This work order is no longer open, so it can't be edited. Reopen it first.",
            values: submittedValues(formData),
        };
    }

    const form = await readWorkOrderForm(formData, organizationId, workOrder.propertyId);
    if (!form.ok) return form.state;
    const { contractor, fields } = form;
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
    redirect(`/work-orders/${workOrderId}?flash=work-order-saved${newLink && contractor ? "&contractorChanged=1" : ""}`);
}

export async function archiveWorkOrder(rawWorkOrderId: string) {
    const workOrderId = parseId(rawWorkOrderId);
    if (!workOrderId) throw new Error("Invalid work order");

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

export async function restoreWorkOrder(rawWorkOrderId: string): Promise<{ ok: true } | { ok: false; error: string }> {
    const workOrderId = parseId(rawWorkOrderId);
    if (!workOrderId) return { ok: false, error: "Work order not found" };

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
    rawWorkOrderId: string,
    confirmation: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
    const workOrderId = parseId(rawWorkOrderId);
    if (!workOrderId) return { ok: false, error: "Work order not found" };
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
