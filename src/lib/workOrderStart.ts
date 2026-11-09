// Server-only. Starts an in-house work order (one the office handles itself): Draft becomes In progress, nothing is
// sent to a contractor, and the tenant is emailed when the work order asks for it. Shared by the office's "Start work"
// button (startWorkOrder in src/app/(app)/work-orders/actions.ts) and the MCP start_work_order tool. The caller checks
// auth and passes the organization it resolved; the lookup here is scoped to it.
import type { User } from "@/generated/prisma/client";
import { notifyTenant } from "@/lib/emails/notifyTenant";
import prisma from "@/lib/prisma";
import { logEvent } from "@/lib/workOrderEvents";
import { formatWorkOrderAddress } from "@/lib/workOrders";

export type StartWorkOrderResult =
    | { ok: true; jobNumber: string; tenantNotified: boolean }
    | { ok: false; error: string };

export async function startInHouseWorkOrder({
    organizationId,
    organization,
    user,
    workOrderId,
}: {
    organizationId: string;
    organization: { name: string; phone: string | null; email: string | null };
    user: Pick<User, "id" | "firstName" | "lastName" | "email">;
    workOrderId: string;
}): Promise<StartWorkOrderResult> {
    const workOrder = await prisma.workOrder.findFirst({
        where: { id: workOrderId, organizationId },
        include: { property: true, unit: true },
    });

    if (!workOrder) return { ok: false, error: "Work order not found" };
    if (workOrder.archived) return { ok: false, error: "Archived work orders can't be started" };
    if (!workOrder.inHouse) {
        return { ok: false, error: "Only in-house work orders can be started. Send this one to its contractor." };
    }
    if (workOrder.status !== "DRAFT") return { ok: false, error: "Only draft work orders can be started" };
    // Nothing to work on without a line item (the same rule as sending one, in src/lib/workOrderSend.ts).
    const itemCount = await prisma.lineItem.count({ where: { area: { workOrderId: workOrder.id } } });
    if (itemCount === 0) return { ok: false, error: "Add at least one line item before starting" };

    // Conditional on it still being an in-house draft, so two clicks can't start it (and email the tenant) twice.
    const updated = await prisma.workOrder.updateMany({
        where: { id: workOrder.id, organizationId, status: "DRAFT", inHouse: true, archived: false },
        data: { status: "IN_PROGRESS", startedAt: new Date() },
    });
    if (updated.count === 0) return { ok: false, error: "Only draft work orders can be started" };

    const tenantNotified = notifyTenant(organization, {
        ...workOrder,
        address: formatWorkOrderAddress(workOrder.property, workOrder.unit),
        contractor: null,
    });
    await logEvent({
        type: "STARTED",
        workOrderId: workOrder.id,
        organizationId,
        actor: { kind: "office", user },
        detail: tenantNotified ? { tenantNotified: true } : {},
    });

    return { ok: true, jobNumber: workOrder.jobNumber, tenantNotified };
}
