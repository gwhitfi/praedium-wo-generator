import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => {
    const prisma = {
        workOrder: { findMany: vi.fn(), updateMany: vi.fn() },
        emailLog: { findMany: vi.fn() },
        // Runs the callback against the same fakes.
        $transaction: vi.fn(),
    };
    prisma.$transaction.mockImplementation((run: (tx: typeof prisma) => unknown) => run(prisma));
    return { default: prisma };
});
vi.mock("@/lib/emailLog", () => {
    class EmailNotSent extends Error {}
    return {
        ACCOUNT_KEY: "email-account",
        EmailNotSent,
        sendLoggedEmail: vi.fn(),
        suppressionMessage: vi.fn(),
    };
});
vi.mock("@/lib/rateLimit", () => ({
    RATE_LIMITS: { emailAccountOffice: { limit: 80, windowSeconds: 86400 } },
    peekRateLimit: vi.fn(),
}));
vi.mock("@/lib/workOrderEvents", () => ({ logEvent: vi.fn() }));
vi.mock("@/lib/email", () => ({ getAppUrl: () => "https://app.example.com" }));

import prisma from "@/lib/prisma";
import { EmailNotSent, sendLoggedEmail, suppressionMessage } from "@/lib/emailLog";
import { peekRateLimit } from "@/lib/rateLimit";
import { logEvent } from "@/lib/workOrderEvents";
import { REMINDER_RULES, reminderDue, sendOverdueReminders } from "./overdueReminders";

const DAY_MS = 24 * 60 * 60 * 1000;
const now = new Date("2026-11-20T14:05:00Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * DAY_MS);

function workOrder(overrides: Record<string, unknown> = {}) {
    return {
        id: "wo1",
        organizationId: "org1",
        jobNumber: "2026-1001",
        title: "Leaking sink",
        publicToken: "tok1",
        dueDate: new Date("2026-11-18T00:00:00Z"),
        sentAt: daysAgo(5),
        reminderCount: 0,
        lastReminderAt: null,
        contractorEmail: " Joe@Example.com ",
        property: { addressLine1: "12 Main St", city: "Springfield", state: "IL", zipCode: "62701" },
        unit: null,
        organization: { name: "Oak Rentals", phone: null, email: "office@example.com" },
        ...overrides,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(prisma.workOrder.findMany).mockResolvedValue([workOrder()] as never);
    vi.mocked(prisma.workOrder.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(prisma.emailLog.findMany).mockResolvedValue([]);
    vi.mocked(sendLoggedEmail).mockResolvedValue({ resendId: "re_1" });
    vi.mocked(suppressionMessage).mockResolvedValue(null);
    vi.mocked(peekRateLimit).mockResolvedValue(0);
});

describe("reminderDue", () => {
    const state = { reminderCount: 0, lastReminderAt: null, sentAt: daysAgo(5) };

    it("sends the first reminder once the work order has been out a day", () => {
        expect(reminderDue(state, now)).toBe(true);
        expect(reminderDue({ ...state, sentAt: new Date(now.getTime() - 2 * 60 * 60 * 1000) }, now)).toBe(false);
        // The daily job may start up to an hour earlier than the day before, but no more.
        expect(reminderDue({ ...state, sentAt: new Date(now.getTime() - 23 * 60 * 60 * 1000) }, now)).toBe(true);
        expect(reminderDue({ ...state, sentAt: new Date(now.getTime() - 18 * 60 * 60 * 1000) }, now)).toBe(false);
    });

    it("waits the interval between reminders, allowing for the job's start time moving", () => {
        expect(reminderDue({ ...state, reminderCount: 1, lastReminderAt: daysAgo(2) }, now)).toBe(false);
        expect(reminderDue({ ...state, reminderCount: 1, lastReminderAt: daysAgo(3) }, now)).toBe(true);
        expect(reminderDue({ ...state, reminderCount: 1, lastReminderAt: daysAgo(2.9) }, now)).toBe(true);
    });

    it("stops at the maximum", () => {
        expect(reminderDue({ ...state, reminderCount: REMINDER_RULES.max, lastReminderAt: daysAgo(30) }, now)).toBe(
            false,
        );
    });
});

describe("sendOverdueReminders", () => {
    it("only asks for enrolled, open, overdue contractor work orders in live organizations", async () => {
        await sendOverdueReminders(now);

        const where = vi.mocked(prisma.workOrder.findMany).mock.calls[0][0]?.where;
        expect(where).toMatchObject({
            status: { in: ["SENT", "IN_PROGRESS"] },
            archived: false,
            inHouse: false,
            overdueReminders: true,
            reminderCount: { lt: REMINDER_RULES.max },
            contractorEmail: { not: null },
            organization: { deletedAt: null },
        });
        expect(where?.dueDate).toEqual({ lt: expect.any(Date) });
    });

    it("claims, sends, and logs the reminder", async () => {
        const report = await sendOverdueReminders(now);

        expect(report).toEqual({ sent: 1, skipped: 0, failed: [] });
        expect(prisma.workOrder.updateMany).toHaveBeenCalledWith({
            where: {
                id: "wo1",
                organizationId: "org1",
                reminderCount: 0,
                lastReminderAt: null,
                // Unchanged and still eligible since it was read.
                contractorEmail: " Joe@Example.com ",
                dueDate: new Date("2026-11-18T00:00:00Z"),
                status: { in: ["SENT", "IN_PROGRESS"] },
                archived: false,
                inHouse: false,
                overdueReminders: true,
            },
            data: { reminderCount: { increment: 1 }, lastReminderAt: now },
        });
        expect(sendLoggedEmail).toHaveBeenCalledWith(
            expect.objectContaining({
                organizationId: "org1",
                kind: "OVERDUE_REMINDER",
                workOrderId: "wo1",
                to: "Joe@Example.com",
                replyTo: "office@example.com",
                fromName: "Oak Rentals",
            }),
        );
        expect(vi.mocked(sendLoggedEmail).mock.calls[0][0].text).toContain("https://app.example.com/wo/tok1");
        expect(logEvent).toHaveBeenCalledWith({
            type: "REMINDER_SENT",
            workOrderId: "wo1",
            organizationId: "org1",
            actor: { kind: "system" },
            detail: { to: "Joe@Example.com", number: 1 },
        });
    });

    it("sends nothing when another run already claimed it", async () => {
        vi.mocked(prisma.workOrder.updateMany).mockResolvedValue({ count: 0 } as never);

        const report = await sendOverdueReminders(now);

        expect(report.sent).toBe(0);
        expect(sendLoggedEmail).not.toHaveBeenCalled();
    });

    it("skips work orders not yet due another reminder", async () => {
        vi.mocked(prisma.workOrder.findMany).mockResolvedValue([
            workOrder({ reminderCount: 1, lastReminderAt: daysAgo(1) }),
        ] as never);

        await sendOverdueReminders(now);

        expect(sendLoggedEmail).not.toHaveBeenCalled();
    });

    it("leaves out suppressed addresses without trying them", async () => {
        vi.mocked(suppressionMessage).mockResolvedValue("bounced");

        const report = await sendOverdueReminders(now);

        expect(report).toEqual({ sent: 0, skipped: 1, failed: [] });
        expect(prisma.workOrder.updateMany).not.toHaveBeenCalled();
    });

    it("stops at the account's office ceiling", async () => {
        vi.mocked(peekRateLimit).mockResolvedValue(80);

        await sendOverdueReminders(now);

        expect(sendLoggedEmail).not.toHaveBeenCalled();
    });

    it("puts a contractor's work orders in one email and logs a reminder on each", async () => {
        vi.mocked(prisma.workOrder.findMany).mockResolvedValue([
            workOrder(),
            workOrder({ id: "wo2", jobNumber: "2026-1002", publicToken: "tok2", contractorEmail: "joe@example.com" }),
            workOrder({ id: "wo3", reminderCount: 1, lastReminderAt: daysAgo(3) }),
        ] as never);

        const report = await sendOverdueReminders(now);

        expect(report).toEqual({ sent: 1, skipped: 0, failed: [] });
        expect(sendLoggedEmail).toHaveBeenCalledTimes(1);
        const email = vi.mocked(sendLoggedEmail).mock.calls[0][0];
        expect(email).toMatchObject({ to: "Joe@Example.com", workOrderId: null });
        expect(email.subject).toBe("3 work orders past due — Oak Rentals");
        expect(email.text).toContain("https://app.example.com/wo/tok1");
        expect(email.text).toContain("https://app.example.com/wo/tok2");
        expect(vi.mocked(logEvent).mock.calls.map(([event]) => [event.workOrderId, event.detail])).toEqual([
            ["wo1", { to: "Joe@Example.com", number: 1 }],
            ["wo2", { to: "Joe@Example.com", number: 1 }],
            ["wo3", { to: "Joe@Example.com", number: 2 }],
        ]);
    });

    it("sends a contractor separate emails from separate organizations", async () => {
        vi.mocked(prisma.workOrder.findMany).mockResolvedValue([
            workOrder(),
            workOrder({ id: "wo2", organizationId: "org2" }),
        ] as never);

        const report = await sendOverdueReminders(now);

        expect(report.sent).toBe(2);
        expect(vi.mocked(sendLoggedEmail).mock.calls.map(([email]) => email.organizationId)).toEqual(["org1", "org2"]);
    });

    it("lists at most perEmail work orders, leaving the rest for the next run", async () => {
        const many = Array.from({ length: REMINDER_RULES.perEmail + 3 }, (_, i) => workOrder({ id: `wo${i}` }));
        vi.mocked(prisma.workOrder.findMany).mockResolvedValue(many as never);

        await sendOverdueReminders(now);

        expect(sendLoggedEmail).toHaveBeenCalledTimes(1);
        expect(prisma.workOrder.updateMany).toHaveBeenCalledTimes(REMINDER_RULES.perEmail);
        expect(logEvent).toHaveBeenCalledTimes(REMINDER_RULES.perEmail);
    });

    it("leaves out work orders another run claimed, and sends the rest", async () => {
        vi.mocked(prisma.workOrder.findMany).mockResolvedValue([workOrder(), workOrder({ id: "wo2" })] as never);
        vi.mocked(prisma.workOrder.updateMany).mockResolvedValueOnce({ count: 0 } as never);

        await sendOverdueReminders(now);

        expect(vi.mocked(sendLoggedEmail).mock.calls[0][0].workOrderId).toBe("wo2");
        expect(vi.mocked(logEvent).mock.calls.map(([event]) => event.workOrderId)).toEqual(["wo2"]);
    });

    it("undoes every claim in the email and stops the organization for this run when a limit refuses", async () => {
        vi.mocked(prisma.workOrder.findMany).mockResolvedValue([
            workOrder(),
            workOrder({ id: "wo2", reminderCount: 1, lastReminderAt: daysAgo(3) }),
            workOrder({ id: "wo3", contractorEmail: "ana@example.com" }),
            workOrder({ id: "wo4", organizationId: "org2" }),
        ] as never);
        vi.mocked(sendLoggedEmail).mockRejectedValueOnce(new EmailNotSent("Daily limit"));

        const report = await sendOverdueReminders(now);

        expect(report).toEqual({ sent: 1, skipped: 2, failed: [] });
        expect(prisma.workOrder.updateMany).toHaveBeenCalledWith({
            where: { id: "wo1", reminderCount: 1, lastReminderAt: now },
            data: { reminderCount: 0, lastReminderAt: null },
        });
        expect(prisma.workOrder.updateMany).toHaveBeenCalledWith({
            where: { id: "wo2", reminderCount: 2, lastReminderAt: now },
            data: { reminderCount: 1, lastReminderAt: daysAgo(3) },
        });
        expect(vi.mocked(sendLoggedEmail).mock.calls.map(([email]) => email.workOrderId)).toEqual([null, "wo4"]);
        expect(logEvent).toHaveBeenCalledTimes(1);
    });

    it("leaves a contractor reminded by the organization in the last 20 hours until the next run", async () => {
        vi.mocked(prisma.workOrder.findMany).mockResolvedValue([
            workOrder(),
            workOrder({ id: "wo2", organizationId: "org2" }),
        ] as never);
        vi.mocked(prisma.emailLog.findMany).mockResolvedValue([
            { organizationId: "org1", to: "joe@example.com" },
        ] as never);

        const report = await sendOverdueReminders(now);

        expect(report).toEqual({ sent: 1, skipped: 1, failed: [] });
        expect(vi.mocked(sendLoggedEmail).mock.calls.map(([email]) => email.organizationId)).toEqual(["org2"]);
        expect(vi.mocked(prisma.emailLog.findMany).mock.calls[0][0]?.where).toEqual({
            kind: "OVERDUE_REMINDER",
            status: { notIn: ["FAILED", "SKIPPED"] },
            createdAt: { gte: new Date(now.getTime() - 20 * 60 * 60 * 1000) },
        });
    });

    it("sends nothing and reports a failure when claiming breaks partway", async () => {
        vi.mocked(prisma.workOrder.findMany).mockResolvedValue([workOrder(), workOrder({ id: "wo2" })] as never);
        const error = new Error("Connection lost");
        vi.mocked(prisma.$transaction).mockRejectedValueOnce(error);

        const report = await sendOverdueReminders(now);

        expect(report).toEqual({ sent: 0, skipped: 0, failed: [{ workOrderId: "wo1", error }] });
        expect(sendLoggedEmail).not.toHaveBeenCalled();
    });

    it("reports a claim it couldn't undo", async () => {
        vi.mocked(sendLoggedEmail).mockRejectedValueOnce(new EmailNotSent("Daily limit"));
        const undoError = new Error("Connection lost");
        vi.mocked(prisma.workOrder.updateMany)
            .mockResolvedValueOnce({ count: 1 } as never)
            .mockRejectedValueOnce(undoError);

        const report = await sendOverdueReminders(now);

        expect(report).toEqual({ sent: 0, skipped: 1, failed: [{ workOrderId: "wo1", error: undoError }] });
    });

    it("reports a provider failure and carries on", async () => {
        vi.mocked(prisma.workOrder.findMany).mockResolvedValue([
            workOrder(),
            workOrder({ id: "wo2", contractorEmail: "ana@example.com" }),
        ] as never);
        const error = new Error("Resend is down");
        vi.mocked(sendLoggedEmail).mockRejectedValueOnce(error);

        const report = await sendOverdueReminders(now);

        expect(report).toEqual({ sent: 1, skipped: 0, failed: [{ workOrderId: "wo1", error }] });
    });

    it("holds each organization to its per-run share of emails", async () => {
        const many = Array.from({ length: REMINDER_RULES.perOrganizationPerRun + 2 }, (_, i) =>
            workOrder({ id: `wo${i}`, contractorEmail: `contractor${i}@example.com` }),
        );
        vi.mocked(prisma.workOrder.findMany).mockResolvedValue(many as never);

        const report = await sendOverdueReminders(now);

        expect(report.sent).toBe(REMINDER_RULES.perOrganizationPerRun);
        expect(report.skipped).toBe(2);
    });
});
