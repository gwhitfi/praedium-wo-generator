"use server";

import { getCurrentUser } from "@/lib/auth";
import { randomBytes } from "node:crypto";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { DeliveryMethod, WorkOrderStatus } from "@/generated/prisma/enums";
import { notifyContractorsCancelled } from "@/lib/emails/notifyCancelled";
import { notifyTenant } from "@/lib/emails/notifyTenant";
import { startInHouseWorkOrder } from "@/lib/workOrderStart";
import { formatWorkOrderAddress, mayNotifyTenant } from "@/lib/workOrders";
import { z } from "zod";
import { logEvent } from "@/lib/workOrderEvents";
import { emailWorkOrderToContractor } from "@/lib/workOrderSend";
import { parseId, tooLong } from "@/lib/validation";
import type { ActionResult } from "@/lib/actionResult";
import { deliveryMethodInput, reopenTarget } from "./schemas";
import { invalid, isEditable } from "./actionHelpers";

// "Email the tenant again" on a reopened draft (see mayNotifyTenant); ignored on a first send.
const notifyTenantAgainInput = z.boolean().default(false);

export async function sendWorkOrder(
    rawWorkOrderId: string,
    rawDeliveryMethod: DeliveryMethod,
    rawNotifyTenantAgain?: boolean,
): Promise<ActionResult> {
    const workOrderId = parseId(rawWorkOrderId);
    if (!workOrderId) throw new Error("Invalid work order");

    const result = await getCurrentUser();
    if (result.state !== "ready") throw new Error("Not authorized");

    const parsed = deliveryMethodInput.safeParse(rawDeliveryMethod);
    if (!parsed.success) return invalid(parsed.error);
    const deliveryMethod = parsed.data;
    const again = notifyTenantAgainInput.safeParse(rawNotifyTenantAgain);
    if (!again.success) return invalid(again.error);

    const workOrder = await prisma.workOrder.findFirst({
        where: { id: workOrderId, organizationId: result.organization.id },
        include: { contractor: true, property: true, unit: true },
    });

    if (!workOrder) throw new Error("Invalid work order");
    if (workOrder.inHouse) return { ok: false, error: "In-house work orders are started, not sent" };
    if (!workOrder.contractorId) return { ok: false, error: "Assign a contractor before sending" };
    if (workOrder.archived) return { ok: false, error: "Archived work orders can't be sent" };
    if (workOrder.status !== "DRAFT") return { ok: false, error: "Only draft work orders can be marked as sent" };
    // Nothing to send without work in it (the same rule as emailing it, in src/lib/workOrderSend.ts).
    const itemCount = await prisma.lineItem.count({
        where: { area: { workOrderId: workOrder.id, workOrder: { organizationId: result.organization.id } } },
    });
    if (itemCount === 0) return { ok: false, error: "Add at least one line item before sending" };

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
        mayNotifyTenant(workOrder, again.data) &&
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
    return { ok: true };
}

type EmailResult = { ok: true; to: string } | { ok: false; error: string };

export async function emailWorkOrder(rawWorkOrderId: string, rawNotifyTenantAgain?: boolean): Promise<EmailResult> {
    const workOrderId = parseId(rawWorkOrderId);
    if (!workOrderId) return { ok: false, error: "Work order not found" };

    const result = await getCurrentUser();
    if (result.state !== "ready") return { ok: false, error: "Not authorized" };

    const again = notifyTenantAgainInput.safeParse(rawNotifyTenantAgain);
    if (!again.success) return invalid(again.error);

    const sent = await emailWorkOrderToContractor({
        organizationId: result.organization.id,
        organization: result.organization,
        user: result.user,
        workOrderId,
        notifyTenantAgain: again.data,
    });
    if (!sent.ok) return sent;

    revalidatePath(`/work-orders/${workOrderId}`);
    revalidatePath("/work-orders");
    return { ok: true, to: sent.to };
}

// "Start work" on an in-house draft: it moves to In progress without sending anything to a contractor.
export async function startWorkOrder(
    rawWorkOrderId: string,
    rawNotifyTenantAgain?: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
    const workOrderId = parseId(rawWorkOrderId);
    if (!workOrderId) return { ok: false, error: "Work order not found" };

    const result = await getCurrentUser();
    if (result.state !== "ready") return { ok: false, error: "Not authorized" };

    const again = notifyTenantAgainInput.safeParse(rawNotifyTenantAgain);
    if (!again.success) return invalid(again.error);

    const started = await startInHouseWorkOrder({
        organizationId: result.organization.id,
        organization: result.organization,
        user: result.user,
        workOrderId,
        notifyTenantAgain: again.data,
    });
    if (!started.ok) return started;

    revalidatePath(`/work-orders/${workOrderId}`);
    revalidatePath("/work-orders");
    revalidatePath("/");
    return { ok: true };
}

// Only work that's out with the contractor (or started by the office's own team) can be marked completed.
export async function markWorkOrderCompleted(rawWorkOrderId: string): Promise<ActionResult> {
    const workOrderId = parseId(rawWorkOrderId);
    if (!workOrderId) throw new Error("Invalid work order");

    const result = await getCurrentUser();
    if (result.state !== "ready") throw new Error("Not authorized");

    const workOrder = await prisma.workOrder.findFirst({
        where: { id: workOrderId, organizationId: result.organization.id },
    });

    if (!workOrder) throw new Error("Invalid work order");
    if (workOrder.archived) return { ok: false, error: "Restore this work order before changing it." };
    if (workOrder.status !== "SENT" && workOrder.status !== "IN_PROGRESS") {
        return { ok: false, error: "Only sent or in-progress work orders can be marked as completed." };
    }

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
    return { ok: true };
}

// Where it lands is decided by reopenTarget() in ./schemas. Returns the new status, so the page can say what's next.
export async function reopenWorkOrder(
    rawWorkOrderId: string,
): Promise<{ ok: true; status: WorkOrderStatus } | { ok: false; error: string }> {
    const workOrderId = parseId(rawWorkOrderId);
    if (!workOrderId) throw new Error("Invalid work order");

    const result = await getCurrentUser();
    if (result.state !== "ready") throw new Error("Not authorized");

    const workOrder = await prisma.workOrder.findFirst({
        where: { id: workOrderId, organizationId: result.organization.id },
    });

    if (!workOrder) throw new Error("Invalid work order");

    const checkedCount =
        workOrder.status === "COMPLETED"
            ? await prisma.lineItem.count({
                  where: {
                      area: { workOrderId: workOrder.id, workOrder: { organizationId: result.organization.id } },
                      completed: true,
                  },
              })
            : 0;
    const target = reopenTarget(workOrder, checkedCount);
    if (!target.ok) return target;

    await prisma.workOrder.update({
        where: { id: workOrderId },
        // Back to Completed keeps its completion date; anything earlier clears it.
        data:
            target.status === "COMPLETED"
                ? { status: target.status, closedAt: null }
                : { status: target.status, closedAt: null, completedAt: null, cancelledAt: null, cancelReason: null },
    });
    await logEvent({
        type: "REOPENED",
        workOrderId,
        organizationId: workOrder.organizationId,
        actor: { kind: "office", user: result.user },
    });

    revalidatePath(`/work-orders/${workOrderId}`);
    revalidatePath("/work-orders");
    revalidatePath(`/wo/${workOrder.publicToken}`);
    return { ok: true, status: target.status };
}

export async function closeWorkOrder(rawWorkOrderId: string): Promise<ActionResult> {
    const workOrderId = parseId(rawWorkOrderId);
    if (!workOrderId) throw new Error("Invalid work order");

    const result = await getCurrentUser();
    if (result.state !== "ready") throw new Error("Not authorized");

    const workOrder = await prisma.workOrder.findFirst({
        where: { id: workOrderId, organizationId: result.organization.id },
    });

    if (!workOrder) throw new Error("Invalid work order");
    if (workOrder.status !== "COMPLETED") return { ok: false, error: "Only completed work orders can be closed" };

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
    return { ok: true };
}

const cancelReasonInput = z
    .string()
    .trim()
    .max(500, tooLong(500))
    .optional()
    .transform((val) => val || null);

export async function cancelWorkOrder(rawWorkOrderId: string, rawReason?: string): Promise<ActionResult> {
    const workOrderId = parseId(rawWorkOrderId);
    if (!workOrderId) throw new Error("Invalid work order");

    const result = await getCurrentUser();
    if (result.state !== "ready") throw new Error("Not authorized");

    const parsed = cancelReasonInput.safeParse(rawReason);
    if (!parsed.success) return invalid(parsed.error);
    const reason = parsed.data;

    const workOrder = await prisma.workOrder.findFirst({
        where: { id: workOrderId, organizationId: result.organization.id },
        include: { property: true, unit: true },
    });

    if (!workOrder) throw new Error("Invalid work order");
    if (workOrder.status !== "SENT" && workOrder.status !== "IN_PROGRESS") {
        return { ok: false, error: "Only sent or in-progress work orders can be cancelled" };
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
    return { ok: true };
}

export async function regeneratePublicToken(rawWorkOrderId: string): Promise<ActionResult> {
    const workOrderId = parseId(rawWorkOrderId);
    if (!workOrderId) throw new Error("Invalid work order");

    const result = await getCurrentUser();
    if (result.state !== "ready") throw new Error("Not authorized");

    const workOrder = await prisma.workOrder.findFirst({
        where: { id: workOrderId, organizationId: result.organization.id },
    });

    if (!workOrder) throw new Error("Invalid work order");
    if (workOrder.inHouse) return { ok: false, error: "In-house work orders have no contractor link" };
    if (!isEditable(workOrder)) return { ok: false, error: "Only open work orders can get a new link." };

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
    return { ok: true };
}
