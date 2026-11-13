// Server-only. Every email Praedium sends for an organization goes through sendLoggedEmail(): it refuses suppressed
// addresses (hard bounces, spam complaints), holds each organization to a daily allowance so open sign-up can't turn
// Praedium into a mail relay, sends through Resend and records the outcome in EmailLog. Resend's webhooks then move
// the row to Delivered, Bounced or Complained (src/lib/resendWebhook.ts).
import { Prisma, type EmailKind } from "@/generated/prisma/client";
import { normalizeEmail } from "@/lib/contractorWorkOrders";
import { dateInAppTimeZone, formatFullDate } from "@/lib/dates";
import { sendEmail } from "@/lib/email";
import prisma from "@/lib/prisma";
import { RATE_LIMITS, rateLimit } from "@/lib/rateLimit";

// An organization this young gets the smaller daily allowance.
export const NEW_ORGANIZATION_MS = 24 * 60 * 60 * 1000;

// An email Praedium chose not to send. The message is written for the person who tried, and safe to show.
export class EmailNotSent extends Error {}

export type LoggedEmail = {
    organizationId: string;
    kind: EmailKind;
    workOrderId?: string | null;
    to: string;
    subject: string;
    html: string;
    text: string;
    replyTo?: string | null;
    fromName?: string | null;
};

type Outcome = { status: "SENT" | "FAILED" | "SKIPPED"; resendId?: string | null; error?: string };

// Records an attempt. A failure here is only logged: the email's fate matters more than its log row.
async function record(email: LoggedEmail, to: string, outcome: Outcome): Promise<void> {
    const data = {
        organizationId: email.organizationId,
        workOrderId: email.workOrderId ?? null,
        kind: email.kind,
        to,
        subject: email.subject.slice(0, 500),
        status: outcome.status,
        resendId: outcome.resendId ?? null,
        error: outcome.error?.slice(0, 1000) ?? null,
    };
    try {
        await prisma.emailLog.create({ data });
    } catch (error) {
        // A deleted work order's cancellation email is sent after the row is gone: keep the log without the link.
        if (data.workOrderId && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
            await prisma.emailLog.create({ data: { ...data, workOrderId: null } }).catch((retryError: unknown) => {
                console.error(`Could not log a ${email.kind} email`, retryError);
            });
            return;
        }
        console.error(`Could not log a ${email.kind} email`, error);
    }
}

// Why a suppressed address won't be emailed, or null when it can be.
export async function suppressionMessage(address: string): Promise<string | null> {
    const suppressed = await prisma.suppressedEmail.findUnique({ where: { email: normalizeEmail(address) } });
    if (!suppressed) return null;
    const on = formatFullDate(dateInAppTimeZone(suppressed.createdAt));
    return suppressed.reason === "COMPLAINED"
        ? `${suppressed.email} marked an earlier email as spam on ${on}, so Praedium won't email it again.`
        : `Email to ${suppressed.email} bounced on ${on}, so Praedium won't email it again. Check the address.`;
}

// Sends the email, or throws EmailNotSent (suppressed address, daily limit) or Resend's error. Returns the log
// row's Resend id. The deletion notice to admins is sent after the organization is locked, so it skips the
// locked-organization refusal, and it skips the daily allowance so a deleting admin can't use up the allowance to
// keep the other admins from hearing about it. Suppressed addresses are still refused and every attempt is logged.
export async function sendLoggedEmail(email: LoggedEmail): Promise<{ resendId: string | null }> {
    const deletionNotice = email.kind === "ORGANIZATION_DELETED";
    const to = normalizeEmail(email.to);

    const suppressed = await suppressionMessage(to);
    if (suppressed) {
        await record(email, to, { status: "SKIPPED", error: suppressed });
        throw new EmailNotSent(suppressed);
    }

    const organization = await prisma.organization.findUnique({
        where: { id: email.organizationId },
        select: { createdAt: true, deletedAt: true },
    });
    if (!organization || (organization.deletedAt && !deletionNotice)) {
        await record(email, to, { status: "SKIPPED", error: "The organization was deleted." });
        throw new EmailNotSent("This organization was deleted.");
    }

    if (!deletionNotice) {
        const isNew = Date.now() - organization.createdAt.getTime() < NEW_ORGANIZATION_MS;
        const rule = isNew ? RATE_LIMITS.emailNewOrganization : RATE_LIMITS.emailDay;
        const allowed = await rateLimit(`${isNew ? "email-new" : "email-day"}:${email.organizationId}`, rule);
        if (!allowed.ok) {
            const message = isNew
                ? `New organizations can send ${rule.limit} emails in their first day. Try again tomorrow.`
                : `This organization has sent its ${rule.limit} emails for today. Try again tomorrow.`;
            await record(email, to, { status: "SKIPPED", error: "Daily email limit reached." });
            throw new EmailNotSent(message);
        }
    }

    try {
        const sent = await sendEmail({
            to,
            subject: email.subject,
            html: email.html,
            text: email.text,
            replyTo: email.replyTo,
            fromName: email.fromName,
        });
        const resendId = sent?.id ?? null;
        await record(email, to, { status: "SENT", resendId });
        return { resendId };
    } catch (error) {
        await record(email, to, { status: "FAILED", error: error instanceof Error ? error.message : String(error) });
        throw error;
    }
}
