// Server-only. Emails a work order's link to its contractor, shared by the office's "Email" button
// (emailWorkOrder in src/app/(app)/work-orders/actions.ts) and the MCP send_work_order tool. The caller checks auth
// and passes the organization it resolved; every query here is scoped to that organization.
import type { User } from "@/generated/prisma/client";
import { getAppUrl, sendEmail } from "@/lib/email";
import { notifyTenant } from "@/lib/emails/notifyTenant";
import { workOrderEmail } from "@/lib/emails/workOrderEmail";
import prisma from "@/lib/prisma";
import { RATE_LIMITS, rateLimit } from "@/lib/rateLimit";
import { logEvent } from "@/lib/workOrderEvents";
import { formatWorkOrderAddress } from "@/lib/workOrders";

export type EmailWorkOrderResult =
    | { ok: true; to: string; jobNumber: string; resent: boolean; tenantNotified: boolean }
    | { ok: false; error: string };

// Works on Draft, Sent and In progress work orders: a draft becomes Sent, and the tenant is emailed on that first
// send when the work order asks for it. Later sends are resends (the email says "Reminder"). Logs a SENT event.
export async function emailWorkOrderToContractor({
    organizationId,
    organization,
    user,
    workOrderId,
}: {
    organizationId: string;
    organization: { name: string; phone: string | null; email: string | null };
    user: Pick<User, "id" | "firstName" | "lastName" | "email">;
    workOrderId: string;
}): Promise<EmailWorkOrderResult> {
    const workOrder = await prisma.workOrder.findFirst({
        where: { id: workOrderId, organizationId },
        include: {
            contractor: true,
            property: true,
            unit: true,
        },
    });

    if (!workOrder) return { ok: false, error: "Work order not found" };
    if (workOrder.archived) return { ok: false, error: "Archived work orders can't be emailed" };
    if (!["DRAFT", "SENT", "IN_PROGRESS"].includes(workOrder.status)) {
        return { ok: false, error: "Only open work orders can be emailed" };
    }
    if (!workOrder.contractor) return { ok: false, error: "Assign a contractor before sending" };

    const to = workOrder.contractor.email?.trim();
    if (!to) return { ok: false, error: `${workOrder.contractor.displayName} has no email address` };

    const limited = await rateLimit(`email:${organizationId}`, RATE_LIMITS.email);
    if (!limited.ok) return { ok: false, error: "Too many emails sent in the last hour. Try again later." };

    const itemCount = await prisma.lineItem.count({ where: { area: { workOrderId } } });
    const address = formatWorkOrderAddress(workOrder.property, workOrder.unit);

    try {
        const email = workOrderEmail({
            organization,
            title: workOrder.title,
            jobNumber: workOrder.jobNumber,
            address,
            dueDate: workOrder.dueDate,
            notes: workOrder.notes,
            itemCount,
            url: `${getAppUrl()}/wo/${workOrder.publicToken}`,
            isResend: workOrder.deliveryMethod === "EMAIL",
        });

        await sendEmail({ to, ...email, replyTo: organization.email, fromName: organization.name });
    } catch (error) {
        console.error("emailWorkOrder failed", error);
        return { ok: false, error: error instanceof Error ? error.message : "Email failed to send" };
    }

    await prisma.workOrder.update({
        where: { id: workOrderId },
        data: {
            deliveryMethod: "EMAIL",
            contractorName: workOrder.contractor.displayName,
            contractorPhone: workOrder.contractor.phone,
            contractorEmail: workOrder.contractor.email,
            ...(workOrder.status === "DRAFT" ? { status: "SENT", sentAt: new Date() } : {}),
        },
    });
    // Only the first send tells the tenant; resends don't.
    const resent = workOrder.status !== "DRAFT";
    const tenantNotified =
        !resent && notifyTenant(organization, { ...workOrder, address, contractor: workOrder.contractor });
    await logEvent({
        type: "SENT",
        workOrderId,
        organizationId: workOrder.organizationId,
        actor: { kind: "office", user },
        detail: {
            deliveryMethod: "EMAIL",
            resent,
            ...(tenantNotified ? { tenantNotified: true } : {}),
        },
    });

    return { ok: true, to, jobNumber: workOrder.jobNumber, resent, tenantNotified };
}
