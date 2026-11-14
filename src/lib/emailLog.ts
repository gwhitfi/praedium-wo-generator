// Server-only. Every email Praedium sends for an organization goes through sendLoggedEmail(): it refuses suppressed
// addresses (hard bounces, spam complaints), holds each organization to a daily allowance so open sign-up can't turn
// Praedium into a mail relay, caps what one address gets from one organization, keeps the whole account under Resend's
// daily quota, sends through Resend and records the outcome in EmailLog. Resend's webhooks then move the row to
// Delivered, Bounced or Complained (src/lib/resendWebhook.ts).
import * as Sentry from "@sentry/nextjs";
import { Prisma, type EmailKind } from "@/generated/prisma/client";
import { normalizeEmail } from "@/lib/contractorWorkOrders";
import { dateInAppTimeZone, formatFullDate } from "@/lib/dates";
import { sendEmail } from "@/lib/email";
import prisma from "@/lib/prisma";
import { RATE_LIMITS, peekRateLimit, rateLimit } from "@/lib/rateLimit";
import { SUPPORT_EMAIL } from "@/lib/support";

// An organization this young gets the smaller daily allowance.
export const NEW_ORGANIZATION_MS = 24 * 60 * 60 * 1000;

// The whole account's count of emails Resend accepted (RATE_LIMITS.emailAccount).
export const ACCOUNT_KEY = "email-account";

// The account's ceiling for this kind: verification codes and deletion notices may use all of it, everything the
// office sends stops earlier so there's always room for them.
function accountCeiling(kind: EmailKind): number {
    return kind === "VERIFY_CODE" || kind === "ORGANIZATION_DELETED"
        ? RATE_LIMITS.emailAccount.limit
        : RATE_LIMITS.emailAccountOffice.limit;
}

// Tells the owner through Sentry, each alert at most once a day. The fingerprint carries the UTC date, so every day
// that crosses opens its own issue (and Sentry's new-issue email). Never throws: the email's outcome doesn't depend
// on it.
async function alertOwner(alert: "warning" | "ceiling", message: string): Promise<void> {
    try {
        const once = await rateLimit(`email-alert-${alert}`, RATE_LIMITS.emailAlert);
        if (!once.ok) return;
        const day = new Date().toISOString().slice(0, 10);
        Sentry.captureMessage(message, {
            level: alert === "warning" ? "warning" : "error",
            fingerprint: [`email-account-${alert}`, day],
        });
        // Events captured by hand aren't flushed before a serverless function stops.
        await Sentry.flush(2000);
    } catch (error) {
        console.error(`Could not send the email ${alert} alert`, error);
    }
}

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
    const support = `If this is a mistake, email ${SUPPORT_EMAIL}.`;
    return suppressed.reason === "COMPLAINED"
        ? `${suppressed.email} marked an earlier email as spam on ${on}, so Praedium won't email it again. ${support}`
        : `Email to ${suppressed.email} bounced on ${on}, so Praedium won't email it again. Check the address. ${support}`;
}

// Sends the email, or throws EmailNotSent (suppressed address, a daily limit) or Resend's error. Returns the log
// row's Resend id. The deletion notice to admins is sent after the organization is locked, so it skips the
// locked-organization refusal, and it skips the organization's and the recipient's daily allowances so a deleting
// admin can't use them up to keep the other admins from hearing about it. Suppressed addresses and the account's
// daily ceiling still apply to it, and every attempt is logged.
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

        const perRecipient = RATE_LIMITS.emailRecipient;
        const recipientAllowed = await rateLimit(`email-to:${email.organizationId}:${to}`, perRecipient);
        if (!recipientAllowed.ok) {
            await record(email, to, { status: "SKIPPED", error: "Daily limit for this recipient reached." });
            throw new EmailNotSent(
                `${to} has already been sent ${perRecipient.limit} emails from this organization today. Try again tomorrow.`,
            );
        }
    }

    // Resend's quota is for the whole account. The total is read here and counted only after Resend accepts the
    // email, so a refused or failed send doesn't use it up. Sends running at the same moment can each pass this check
    // before either is counted, so the total can go a little over; the gap to Resend's own limit absorbs that.
    const accountTotal = await peekRateLimit(ACCOUNT_KEY);
    if (accountTotal >= accountCeiling(email.kind)) {
        await record(email, to, { status: "SKIPPED", error: "Praedium's daily email limit reached." });
        await alertOwner(
            "ceiling",
            `Praedium stopped sending email: ${accountTotal} sent today, at the daily ceiling (${RATE_LIMITS.emailAccountOffice.limit} for the office, ${RATE_LIMITS.emailAccount.limit} with verification codes and deletion notices).`,
        );
        throw new EmailNotSent(
            "Praedium can't send more email today. Try again tomorrow, or share the link yourself (Mark as sent first if it's a draft).",
        );
    }

    let resendId: string | null;
    try {
        const sent = await sendEmail({
            to,
            subject: email.subject,
            html: email.html,
            text: email.text,
            replyTo: email.replyTo,
            fromName: email.fromName,
        });
        resendId = sent?.id ?? null;
    } catch (error) {
        await record(email, to, { status: "FAILED", error: error instanceof Error ? error.message : String(error) });
        throw error;
    }
    await record(email, to, { status: "SENT", resendId });

    const counted = await rateLimit(ACCOUNT_KEY, RATE_LIMITS.emailAccount);
    const sentToday = RATE_LIMITS.emailAccount.limit - counted.remaining;
    if (sentToday >= RATE_LIMITS.emailAccountWarning.limit) {
        await alertOwner(
            "warning",
            `Praedium has sent ${sentToday} emails today; the office stops at ${RATE_LIMITS.emailAccountOffice.limit} and everything at ${RATE_LIMITS.emailAccount.limit}.`,
        );
    }
    return { resendId };
}
