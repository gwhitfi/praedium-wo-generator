// Server-only. Applies Resend's delivery reports (webhooks, verified in src/app/api/webhooks/resend/route.ts) to
// EmailLog: delivered, hard-bounced or marked as spam. Bounces and complaints suppress the address for good
// (SuppressedEmail, checked by src/lib/emailLog.ts) and show in the work order's Activity. Every step is safe to
// repeat, since Resend may deliver the same report more than once.
import type { EmailStatus } from "@/generated/prisma/client";
import { normalizeEmail } from "@/lib/contractorWorkOrders";
import prisma from "@/lib/prisma";
import { logEventOnce } from "@/lib/workOrderEvents";

// The parts of Resend's webhook payload Praedium reads.
export type ResendReport = {
    type: string;
    data: { email_id?: string; to?: string[]; bounce?: { type?: string; message?: string } };
};

// A status only moves forward: a late "delivered" can't hide a bounce or a complaint.
const REPLACES: Record<"DELIVERED" | "BOUNCED" | "COMPLAINED", EmailStatus[]> = {
    DELIVERED: ["SENT"],
    BOUNCED: ["SENT", "DELIVERED"],
    COMPLAINED: ["SENT", "DELIVERED", "BOUNCED"],
};

async function suppress(addresses: string[], reason: "BOUNCED" | "COMPLAINED", detail: string | null): Promise<void> {
    for (const address of addresses) {
        const email = normalizeEmail(address);
        if (!email) continue;
        // A complaint outranks a bounce; otherwise the first reason is kept.
        await prisma.suppressedEmail.upsert({
            where: { email },
            create: { email, reason, detail: detail?.slice(0, 1000) ?? null },
            update: reason === "COMPLAINED" ? { reason } : {},
        });
    }
}

export async function handleResendReport(report: ResendReport): Promise<void> {
    const { type, data } = report;
    if (type !== "email.delivered" && type !== "email.bounced" && type !== "email.complained") return;

    const permanentBounce = type === "email.bounced" && data.bounce?.type === "Permanent";
    const bounceMessage = data.bounce?.message?.trim() || null;

    // Suppress first, even for emails sent before Praedium kept a log (no matching row).
    if (permanentBounce) await suppress(data.to ?? [], "BOUNCED", bounceMessage);
    if (type === "email.complained") await suppress(data.to ?? [], "COMPLAINED", null);

    const log = data.email_id ? await prisma.emailLog.findUnique({ where: { resendId: data.email_id } }) : null;
    if (!log) return;

    // A temporary bounce: Resend keeps trying, so only the reason is noted.
    if (type === "email.bounced" && !permanentBounce) {
        await prisma.emailLog.updateMany({
            where: { id: log.id, status: "SENT" },
            data: { error: `Temporary bounce: ${bounceMessage ?? "no reason given"}`.slice(0, 1000) },
        });
        return;
    }

    const status = type === "email.delivered" ? "DELIVERED" : type === "email.bounced" ? "BOUNCED" : "COMPLAINED";
    const updated = await prisma.emailLog.updateMany({
        where: { id: log.id, status: { in: REPLACES[status] } },
        data: { status, ...(status === "BOUNCED" ? { error: bounceMessage?.slice(0, 1000) ?? null } : {}) },
    });
    if (updated.count === 0 || !log.workOrderId) return;

    const base = {
        workOrderId: log.workOrderId,
        organizationId: log.organizationId,
        actor: { kind: "system" as const },
    };
    if (status === "DELIVERED") {
        // Only the contractor's work order email: "did they get it?" is the question the office asks.
        if (log.kind !== "WORK_ORDER") return;
        await logEventOnce(
            { ...base, type: "EMAIL_DELIVERED", detail: { to: log.to, kind: log.kind } },
            `email:${log.id}:delivered`,
        );
        return;
    }
    await logEventOnce(
        {
            ...base,
            type: "EMAIL_BOUNCED",
            detail: {
                to: log.to,
                kind: log.kind,
                reason: status === "COMPLAINED" ? "complained" : "bounced",
                ...(status === "BOUNCED" && bounceMessage ? { message: bounceMessage.slice(0, 500) } : {}),
            },
        },
        `email:${log.id}:${status.toLowerCase()}`,
    );
}
