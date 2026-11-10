import { after } from "next/server";
import { sendLoggedEmail } from "@/lib/emailLog";
import { tenantNotifiedEmail } from "./tenantNotifiedEmail";

type Organization = { id: string; name: string; phone: string | null; email: string | null };
type SentWorkOrder = {
    id: string;
    title: string | null;
    address: string;
    notifyTenant: boolean;
    tenantEmail: string | null;
    // Null for an in-house work order: the email says the office's own team will be in touch.
    contractor: { displayName: string; company: string | null } | null;
};

// Emails the tenant that their work order went to a contractor (or, for an in-house work order, that the office
// is handling it). Call it only when a work order is first sent or started.
// Sends after the response, so a slow or failed email never blocks sending. Returns whether an email was queued.
export function notifyTenant(organization: Organization, workOrder: SentWorkOrder): boolean {
    const to = workOrder.tenantEmail?.trim();
    if (!workOrder.notifyTenant || !to) return false;

    after(async () => {
        try {
            const email = tenantNotifiedEmail({
                organization,
                title: workOrder.title,
                address: workOrder.address,
                contractor: workOrder.contractor && {
                    name: workOrder.contractor.displayName,
                    company: workOrder.contractor.company,
                },
            });
            await sendLoggedEmail({
                organizationId: organization.id,
                kind: "TENANT_NOTICE",
                workOrderId: workOrder.id,
                to,
                ...email,
                replyTo: organization.email,
                fromName: organization.name,
            });
        } catch (error) {
            console.error(`Tenant notice failed for work order ${workOrder.id}`, error);
        }
    });
    return true;
}
