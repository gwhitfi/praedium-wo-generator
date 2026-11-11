// Server-only. Status changes for the MCP tools, registered only for API keys with canChangeStatus. They follow the
// office actions in src/app/(app)/work-orders/ (emailWorkOrder and cancelWorkOrder in statusActions.ts,
// archiveWorkOrder and restoreWorkOrder in actions.ts): the same rules, emails and Activity events, attributed to the
// key's creator. Every lookup is scoped to the API key's organization. Expected failures come back as
// { ok: false, error }.
import { z } from "zod";
import type { Organization, WorkOrderStatus } from "@/generated/prisma/client";
import { notifyContractorsCancelled } from "@/lib/emails/notifyCancelled";
import prisma from "@/lib/prisma";
import { logEvent, type Actor } from "@/lib/workOrderEvents";
import { formatWorkOrderAddress } from "@/lib/workOrders";
import { emailWorkOrderToContractor } from "@/lib/workOrderSend";
import { startInHouseWorkOrder } from "@/lib/workOrderStart";

type OfficeUser = Extract<Actor, { kind: "office" }>["user"];
type Failure = { ok: false; error: string };
// The organization's name, phone and email go into the emails.
type StatusOrganization = Pick<Organization, "id" | "name" | "phone" | "email">;

const WORK_ORDER_NOT_FOUND = "No work order with that id was found.";

const id = z.string().min(1).max(100);

export const statusInput = z.object({ id });

export type SendResult =
    | {
          ok: true;
          workOrder: {
              id: string;
              jobNumber: string;
              status: "SENT";
              sentTo: string;
              resent: boolean;
              tenantNotified: boolean;
          };
      }
    | Failure;

// Emails the contractor the work order link, as the office's Email button does.
export async function sendWorkOrder(
    organization: StatusOrganization,
    user: OfficeUser,
    input: z.output<typeof statusInput>,
): Promise<SendResult> {
    const sent = await emailWorkOrderToContractor({
        organizationId: organization.id,
        organization,
        user,
        workOrderId: input.id,
    });
    if (!sent.ok) return sent;

    return {
        ok: true,
        workOrder: {
            id: input.id,
            jobNumber: sent.jobNumber,
            status: "SENT",
            sentTo: sent.to,
            resent: sent.resent,
            tenantNotified: sent.tenantNotified,
        },
    };
}

export type StartResult =
    | { ok: true; workOrder: { id: string; jobNumber: string; status: "IN_PROGRESS"; tenantNotified: boolean } }
    | Failure;

// Starts an in-house draft, as the office's "Start work" button does: nothing goes to a contractor.
export async function startWorkOrder(
    organization: StatusOrganization,
    user: OfficeUser,
    input: z.output<typeof statusInput>,
): Promise<StartResult> {
    const started = await startInHouseWorkOrder({
        organizationId: organization.id,
        organization,
        user,
        workOrderId: input.id,
    });
    if (!started.ok) return started;

    return {
        ok: true,
        workOrder: {
            id: input.id,
            jobNumber: started.jobNumber,
            status: "IN_PROGRESS",
            tenantNotified: started.tenantNotified,
        },
    };
}

export const cancelInput = z.object({ id, reason: z.string().trim().min(1).max(500).optional() });

type StatusResult = { ok: true; workOrder: { id: string; jobNumber: string; status: WorkOrderStatus } } | Failure;

function findWorkOrder(organizationId: string, workOrderId: string) {
    return prisma.workOrder.findFirst({
        where: { id: workOrderId, organizationId },
        include: { property: true, unit: true },
    });
}

export async function cancelWorkOrder(
    organization: StatusOrganization,
    user: OfficeUser,
    input: z.output<typeof cancelInput>,
): Promise<StatusResult> {
    const workOrder = await findWorkOrder(organization.id, input.id);
    if (!workOrder) return { ok: false, error: WORK_ORDER_NOT_FOUND };
    if (workOrder.status !== "SENT" && workOrder.status !== "IN_PROGRESS") {
        return {
            ok: false,
            error: "Only sent or in-progress work orders can be cancelled. Archive a draft instead.",
        };
    }

    const reason = input.reason ?? null;
    await prisma.workOrder.update({
        where: { id: workOrder.id },
        data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason },
    });
    await logEvent({
        type: "CANCELLED",
        workOrderId: workOrder.id,
        organizationId: organization.id,
        actor: { kind: "office", user },
        detail: { reason },
    });

    if (!workOrder.archived) {
        notifyContractorsCancelled(organization, [
            { ...workOrder, address: formatWorkOrderAddress(workOrder.property, workOrder.unit) },
        ]);
    }

    return { ok: true, workOrder: { id: workOrder.id, jobNumber: workOrder.jobNumber, status: "CANCELLED" } };
}

type ArchiveResult =
    { ok: true; workOrder: { id: string; jobNumber: string; status: WorkOrderStatus; archived: boolean } } | Failure;

// A sent or in-progress work order is cancelled too, and its contractor emailed, as in the app.
export async function archiveWorkOrder(
    organization: StatusOrganization,
    user: OfficeUser,
    input: z.output<typeof statusInput>,
): Promise<ArchiveResult> {
    const workOrder = await findWorkOrder(organization.id, input.id);
    if (!workOrder) return { ok: false, error: WORK_ORDER_NOT_FOUND };
    if (workOrder.archived) return { ok: false, error: "This work order is already archived." };

    const willCancel = workOrder.status === "SENT" || workOrder.status === "IN_PROGRESS";
    await prisma.workOrder.update({
        where: { id: workOrder.id },
        data: willCancel ? { archived: true, status: "CANCELLED", cancelledAt: new Date() } : { archived: true },
    });

    const event = {
        workOrderId: workOrder.id,
        organizationId: organization.id,
        actor: { kind: "office" as const, user },
    };
    if (willCancel) await logEvent({ ...event, type: "CANCELLED", detail: { reason: "Archived" } });
    await logEvent({ ...event, type: "ARCHIVED" });

    if (willCancel) {
        notifyContractorsCancelled(organization, [
            { ...workOrder, address: formatWorkOrderAddress(workOrder.property, workOrder.unit) },
        ]);
    }

    return {
        ok: true,
        workOrder: {
            id: workOrder.id,
            jobNumber: workOrder.jobNumber,
            status: willCancel ? "CANCELLED" : workOrder.status,
            archived: true,
        },
    };
}

// Restoring doesn't change the status: a work order cancelled by archiving stays cancelled.
export async function restoreWorkOrder(
    organization: StatusOrganization,
    user: OfficeUser,
    input: z.output<typeof statusInput>,
): Promise<ArchiveResult> {
    const workOrder = await prisma.workOrder.findFirst({
        where: { id: input.id, organizationId: organization.id },
        include: { property: { select: { archived: true } } },
    });
    if (!workOrder) return { ok: false, error: WORK_ORDER_NOT_FOUND };
    if (!workOrder.archived) return { ok: false, error: "This work order isn't archived." };
    if (workOrder.property.archived) {
        return { ok: false, error: "This work order's property is archived. Restore the property first." };
    }

    await prisma.workOrder.update({ where: { id: workOrder.id }, data: { archived: false } });
    await logEvent({
        type: "RESTORED",
        workOrderId: workOrder.id,
        organizationId: organization.id,
        actor: { kind: "office", user },
    });

    return {
        ok: true,
        workOrder: { id: workOrder.id, jobNumber: workOrder.jobNumber, status: workOrder.status, archived: false },
    };
}
