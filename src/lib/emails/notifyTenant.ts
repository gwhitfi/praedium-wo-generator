import { after } from "next/server";
import { sendEmail } from "@/lib/email";
import { tenantNotifiedEmail } from "./tenantNotifiedEmail";

type Organization = { name: string; phone: string | null; email: string | null };
type SentWorkOrder = {
    id: string;
    title: string | null;
    address: string;
    notifyTenant: boolean;
    tenantEmail: string | null;
    contractor: { displayName: string; company: string | null };
};

// Emails the tenant that their work order went to a contractor. Call it only when a work order is first sent.
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
                contractor: { name: workOrder.contractor.displayName, company: workOrder.contractor.company },
            });
            await sendEmail({ to, ...email, replyTo: organization.email, fromName: organization.name });
        } catch (error) {
            console.error(`Tenant notice failed for work order ${workOrder.id}`, error);
        }
    });
    return true;
}
