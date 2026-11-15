// Server-only. Emails a work order's link to its contractor, shared by the office's "Email" button
// (emailWorkOrder in src/app/(app)/work-orders/statusActions.ts) and the MCP send_work_order tool. The caller checks
// auth and passes the organization it resolved; every query here is scoped to that organization.
import { randomBytes } from "node:crypto";
import type { User } from "@/generated/prisma/client";
import { normalizeEmail } from "@/lib/contractorWorkOrders";
import { getAppUrl } from "@/lib/email";
import { EmailNotSent, sendLoggedEmail } from "@/lib/emailLog";
import { notifyTenant } from "@/lib/emails/notifyTenant";
import { workOrderEmail } from "@/lib/emails/workOrderEmail";
import prisma from "@/lib/prisma";
import { RATE_LIMITS, rateLimit } from "@/lib/rateLimit";
import { logEvent } from "@/lib/workOrderEvents";
import { formatWorkOrderAddress, mayNotifyTenant } from "@/lib/workOrders";

export type EmailWorkOrderResult =
    | { ok: true; to: string; jobNumber: string; resent: boolean; tenantNotified: boolean }
    | { ok: false; error: string };

// Works on Draft, Sent and In progress work orders: a draft becomes Sent, and the tenant is emailed on that first
// send when the work order asks for it. Later sends are resends (the email says "Reminder"). A reopened draft
// emails the tenant again only with `notifyTenantAgain` (see mayNotifyTenant). Logs a SENT event.
export async function emailWorkOrderToContractor({
    organizationId,
    organization,
    user,
    workOrderId,
    notifyTenantAgain = false,
}: {
    organizationId: string;
    organization: { name: string; phone: string | null; email: string | null };
    user: Pick<User, "id" | "firstName" | "lastName" | "email">;
    workOrderId: string;
    notifyTenantAgain?: boolean;
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
    if (workOrder.inHouse) {
        return { ok: false, error: "This work order is handled in-house, so there's no contractor to email" };
    }
    if (!workOrder.contractor) return { ok: false, error: "Assign a contractor before sending" };

    const to = workOrder.contractor.email?.trim();
    if (!to) return { ok: false, error: `${workOrder.contractor.displayName} has no email address` };

    // A draft with nothing in it gives the contractor nothing to do, so it can't go out until it has a line item.
    const itemCount = await prisma.lineItem.count({ where: { area: { workOrderId } } });
    if (workOrder.status === "DRAFT" && itemCount === 0) {
        return { ok: false, error: "Add at least one line item before sending" };
    }

    const limited = await rateLimit(`email:${organizationId}`, RATE_LIMITS.email);
    if (!limited.ok) return { ok: false, error: "Too many emails sent in the last hour. Try again later." };
    const address = formatWorkOrderAddress(workOrder.property, workOrder.unit);

    // The contact's email changed since the work order was last sent: issue a new link, so the old recipient's link
    // stops working.
    const recipientChanged =
        !!workOrder.contractorEmail && normalizeEmail(workOrder.contractorEmail) !== normalizeEmail(to);
    const publicToken = recipientChanged ? randomBytes(24).toString("base64url") : workOrder.publicToken;
    // Saved before the email goes out, so the link in it always works. If the send then fails, the old recipient's
    // link is already dead (as intended) and the office can send again.
    if (recipientChanged) {
        try {
            await prisma.workOrder.update({ where: { id: workOrderId }, data: { publicToken } });
        } catch (error) {
            console.error("emailWorkOrder: saving the new link failed", error);
            return { ok: false, error: "Couldn't save the new contractor link, so nothing was sent. Try again." };
        }
    }

    try {
        const email = workOrderEmail({
            organization,
            title: workOrder.title,
            jobNumber: workOrder.jobNumber,
            address,
            dueDate: workOrder.dueDate,
            notes: workOrder.notes,
            itemCount,
            url: `${getAppUrl()}/wo/${publicToken}`,
            // A draft that was emailed before was cancelled and reopened: this send puts it back on, not a reminder.
            isResend: workOrder.deliveryMethod === "EMAIL" && workOrder.status !== "DRAFT",
        });

        await sendLoggedEmail({
            organizationId,
            kind: "WORK_ORDER",
            workOrderId,
            to,
            ...email,
            replyTo: organization.email,
            fromName: organization.name,
        });
    } catch (error) {
        console.error("emailWorkOrder failed", error);
        // Only Praedium's own refusals are written for the office; a provider error stays in the log.
        if (error instanceof EmailNotSent) return { ok: false, error: error.message };
        return { ok: false, error: "The email couldn't be sent. Try again." };
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
    // Only the first send tells the tenant; resends don't, and a reopened draft only when asked.
    const resent = workOrder.status !== "DRAFT";
    const tenantNotified =
        mayNotifyTenant(workOrder, notifyTenantAgain) &&
        notifyTenant(
            { ...organization, id: organizationId },
            { ...workOrder, address, contractor: workOrder.contractor },
        );
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
