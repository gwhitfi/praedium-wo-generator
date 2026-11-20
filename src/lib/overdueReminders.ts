// Server-only. Overdue reminders: once a day (src/app/api/cron/reminders/route.ts) Work Order Fox emails the contractor
// of each enrolled work order that is past its due date and not done yet, one email per contractor and organization
// listing all of theirs due a reminder that day. A work order gets at most
// REMINDER_RULES.max reminders, the first the day after its due date and then one every `intervalDays`; the count and
// time start over when the due date or contractor changes (REMINDER_RESET). Work orders from before the feature were
// enrolled only if an admin chose to (answerRemindersPrompt in src/app/(app)/settings/actions.ts).
import type { WorkOrderStatus } from "@/generated/prisma/client";
import { dateInAppTimeZone } from "@/lib/dates";
import { OVERDUE_REMINDER_MAX } from "@/lib/defaults";
import { getAppUrl } from "@/lib/email";
import { ACCOUNT_KEY, EmailNotSent, sendLoggedEmail, suppressionMessage } from "@/lib/emailLog";
import { overdueReminderEmail } from "@/lib/emails/overdueReminderEmail";
import prisma from "@/lib/prisma";
import { RATE_LIMITS, peekRateLimit } from "@/lib/rateLimit";
import { logEvent } from "@/lib/workOrderEvents";
import { formatWorkOrderAddress } from "@/lib/workOrders";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const REMINDER_RULES = {
    // Reminders per work order, per due date and contractor.
    max: OVERDUE_REMINDER_MAX,
    // Days between reminders.
    intervalDays: 3,
    // A work order sent less than a day ago isn't reminded yet, even if it went out already late.
    sinceSentDays: 1,
    // Vercel's Hobby plan starts a daily job anywhere within its hour, so "a day later" may be up to an hour under...
    startJitterHours: 1,
    // ...and "3 days later" a little under.
    slackHours: 6,
    // A contractor who got a reminder from the organization this recently is left until the next run, so a second
    // run on the same day (started by hand, or Vercel calling twice) doesn't email them again.
    quietHours: 20,
    // Each run sends at most this many per organization, and in all, so reminders leave room in the daily email
    // allowances (src/lib/rateLimit.ts) for what the office sends itself.
    // These count emails; one email lists up to `perEmail` work orders, and the rest wait for the next run.
    perOrganizationPerRun: 10,
    perRun: 30,
    perEmail: 20,
} as const;

// Statuses the contractor still has work in.
export const REMINDER_STATUSES: WorkOrderStatus[] = ["SENT", "IN_PROGRESS"];

// What an edit sets when the due date or the contractor changes: a new deadline starts a new set of reminders.
export const REMINDER_RESET = { reminderCount: 0, lastReminderAt: null } as const;

type ReminderState = { reminderCount: number; lastReminderAt: Date | null; sentAt: Date | null };

// Whether a work order that is overdue and enrolled is due its next reminder at `now`.
export function reminderDue(workOrder: ReminderState, now: Date): boolean {
    if (workOrder.reminderCount >= REMINDER_RULES.max) return false;
    const sinceSent = REMINDER_RULES.sinceSentDays * DAY_MS - REMINDER_RULES.startJitterHours * HOUR_MS;
    if (workOrder.sentAt && now.getTime() - workOrder.sentAt.getTime() < sinceSent) return false;
    if (!workOrder.lastReminderAt) return true;
    const interval = REMINDER_RULES.intervalDays * DAY_MS - REMINDER_RULES.slackHours * HOUR_MS;
    return now.getTime() - workOrder.lastReminderAt.getTime() >= interval;
}

// Counts emails, not work orders. A failed email is reported by its first work order.
export type ReminderReport = { sent: number; skipped: number; failed: { workOrderId: string; error: unknown }[] };

// Each contractor gets one email per organization and run, listing every work order of theirs due a reminder.
export async function sendOverdueReminders(now: Date = new Date()): Promise<ReminderReport> {
    const report: ReminderReport = { sent: 0, skipped: 0, failed: [] };

    const candidates = await prisma.workOrder.findMany({
        where: {
            status: { in: REMINDER_STATUSES },
            archived: false,
            inHouse: false,
            overdueReminders: true,
            reminderCount: { lt: REMINDER_RULES.max },
            dueDate: { lt: dateInAppTimeZone(now) },
            contractorEmail: { not: null },
            organization: { deletedAt: null },
        },
        include: {
            property: true,
            unit: true,
            organization: { select: { name: true, phone: true, email: true } },
        },
        // The longest overdue first, so the per-run caps hold back the newest.
        orderBy: [{ dueDate: "asc" }, { id: "asc" }],
    });

    // One group per organization and contractor address (compared trimmed and lower-cased), in the candidates' order,
    // so the longest overdue go first. The email goes to the address as the first work order has it.
    type Candidate = (typeof candidates)[number] & { dueDate: Date };
    const groups = new Map<string, { organizationId: string; to: string; workOrders: Candidate[] }>();
    for (const workOrder of candidates) {
        const to = workOrder.contractorEmail?.trim();
        if (!to || !workOrder.dueDate || !reminderDue(workOrder, now)) continue;
        const key = `${workOrder.organizationId}\n${to.toLowerCase()}`;
        const group = groups.get(key) ?? { organizationId: workOrder.organizationId, to, workOrders: [] };
        group.workOrders.push({ ...workOrder, dueDate: workOrder.dueDate });
        groups.set(key, group);
    }

    // Contractors already reminded by the organization within quietHours (EmailLog keeps `to` lower-cased).
    const recent = groups.size
        ? await prisma.emailLog.findMany({
              where: {
                  kind: "OVERDUE_REMINDER",
                  status: { notIn: ["FAILED", "SKIPPED"] },
                  createdAt: { gte: new Date(now.getTime() - REMINDER_RULES.quietHours * HOUR_MS) },
              },
              select: { organizationId: true, to: true },
          })
        : [];
    const remindedRecently = new Set(recent.map((email) => `${email.organizationId}\n${email.to.toLowerCase()}`));

    const perOrganization = new Map<string, number>();
    // Organizations a refusal stopped for this run (their daily allowance, most likely); tried again tomorrow.
    const stopped = new Set<string>();

    for (const [key, { organizationId, to, workOrders }] of groups) {
        if (report.sent >= REMINDER_RULES.perRun) break;
        if (remindedRecently.has(key)) {
            report.skipped++;
            continue;
        }
        const sentHere = perOrganization.get(organizationId) ?? 0;
        if (stopped.has(organizationId) || sentHere >= REMINDER_RULES.perOrganizationPerRun) {
            report.skipped++;
            continue;
        }
        // A suppressed address would be refused every day; leave it out without logging a refusal each time.
        if (await suppressionMessage(to)) {
            report.skipped++;
            continue;
        }
        // Stop before the account's office ceiling instead of logging a refusal for every remaining email.
        if ((await peekRateLimit(ACCOUNT_KEY)) >= RATE_LIMITS.emailAccountOffice.limit) {
            report.skipped++;
            break;
        }

        // Claim each reminder first, so a second run at the same time can't send it again; undone if the send fails.
        // The claim matches the work order only as it was read, still eligible, with the same contractor and due date,
        // so an edit in the meantime (a new contractor resets the count to the same 0) leaves it out. All or none.
        let claimed: { workOrder: Candidate; number: number }[];
        try {
            claimed = await prisma.$transaction(async (tx) => {
                const won: { workOrder: Candidate; number: number }[] = [];
                for (const workOrder of workOrders.slice(0, REMINDER_RULES.perEmail)) {
                    const result = await tx.workOrder.updateMany({
                        where: {
                            id: workOrder.id,
                            organizationId,
                            reminderCount: workOrder.reminderCount,
                            lastReminderAt: workOrder.lastReminderAt,
                            contractorEmail: workOrder.contractorEmail,
                            dueDate: workOrder.dueDate,
                            status: { in: REMINDER_STATUSES },
                            archived: false,
                            inHouse: false,
                            overdueReminders: true,
                        },
                        data: { reminderCount: { increment: 1 }, lastReminderAt: now },
                    });
                    if (result.count > 0) won.push({ workOrder, number: workOrder.reminderCount + 1 });
                }
                return won;
            });
        } catch (error) {
            report.failed.push({ workOrderId: workOrders[0].id, error });
            continue;
        }
        if (claimed.length === 0) continue;

        const { organization } = claimed[0].workOrder;
        try {
            const email = overdueReminderEmail({
                organization,
                jobs: claimed.map(({ workOrder }) => ({
                    title: workOrder.title,
                    jobNumber: workOrder.jobNumber,
                    address: formatWorkOrderAddress(workOrder.property, workOrder.unit),
                    dueDate: workOrder.dueDate,
                    url: `${getAppUrl()}/wo/${workOrder.publicToken}`,
                })),
            });
            await sendLoggedEmail({
                organizationId,
                kind: "OVERDUE_REMINDER",
                // An email about several work orders belongs to none of them in the log.
                workOrderId: claimed.length === 1 ? claimed[0].workOrder.id : null,
                to,
                ...email,
                replyTo: organization.email,
                fromName: organization.name,
            });
        } catch (error) {
            for (const { workOrder, number } of claimed) {
                await prisma.workOrder
                    .updateMany({
                        where: { id: workOrder.id, reminderCount: number, lastReminderAt: now },
                        data: { reminderCount: workOrder.reminderCount, lastReminderAt: workOrder.lastReminderAt },
                    })
                    .catch((undoError: unknown) => {
                        // The reminder counts as sent though it wasn't; report it so the run shows as failed.
                        console.error(`Reminders: couldn't undo the claim on ${workOrder.id}`, undoError);
                        report.failed.push({ workOrderId: workOrder.id, error: undoError });
                    });
            }
            if (error instanceof EmailNotSent) {
                stopped.add(organizationId);
                report.skipped++;
            } else {
                report.failed.push({ workOrderId: claimed[0].workOrder.id, error });
            }
            continue;
        }

        report.sent++;
        perOrganization.set(organizationId, sentHere + 1);
        for (const { workOrder, number } of claimed) {
            await logEvent({
                type: "REMINDER_SENT",
                workOrderId: workOrder.id,
                organizationId,
                actor: { kind: "system" },
                detail: { to, number },
            });
        }
    }

    return report;
}
