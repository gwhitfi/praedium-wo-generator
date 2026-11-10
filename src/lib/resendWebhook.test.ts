import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
    default: {
        suppressedEmail: { upsert: vi.fn() },
        emailLog: { findUnique: vi.fn(), updateMany: vi.fn() },
    },
}));
vi.mock("@/lib/workOrderEvents", () => ({ logEventOnce: vi.fn() }));

import prisma from "@/lib/prisma";
import { logEventOnce } from "@/lib/workOrderEvents";
import { handleResendReport } from "./resendWebhook";

const log = {
    id: "log1",
    organizationId: "org1",
    workOrderId: "wo1",
    kind: "WORK_ORDER",
    to: "joe@example.com",
    status: "SENT",
};
const base = { email_id: "re_1", to: ["Joe@Example.com"] };

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.emailLog.findUnique).mockResolvedValue(log as never);
    vi.mocked(prisma.emailLog.updateMany).mockResolvedValue({ count: 1 } as never);
});

describe("handleResendReport", () => {
    it("marks a work order email delivered, only from Sent, and notes it in Activity once", async () => {
        await handleResendReport({ type: "email.delivered", data: base });

        expect(prisma.emailLog.findUnique).toHaveBeenCalledWith({ where: { resendId: "re_1" } });
        expect(prisma.emailLog.updateMany).toHaveBeenCalledWith({
            where: { id: "log1", status: { in: ["SENT"] } },
            data: { status: "DELIVERED" },
        });
        expect(logEventOnce).toHaveBeenCalledWith(
            {
                type: "EMAIL_DELIVERED",
                workOrderId: "wo1",
                organizationId: "org1",
                actor: { kind: "system" },
                detail: { to: "joe@example.com", kind: "WORK_ORDER" },
            },
            "email:log1:delivered",
        );
        expect(prisma.suppressedEmail.upsert).not.toHaveBeenCalled();
    });

    it("doesn't note deliveries of other emails, or one that didn't change the status", async () => {
        vi.mocked(prisma.emailLog.findUnique).mockResolvedValue({ ...log, kind: "TENANT_NOTICE" } as never);
        await handleResendReport({ type: "email.delivered", data: base });

        vi.mocked(prisma.emailLog.findUnique).mockResolvedValue(log as never);
        vi.mocked(prisma.emailLog.updateMany).mockResolvedValue({ count: 0 } as never);
        await handleResendReport({ type: "email.delivered", data: base });

        expect(logEventOnce).not.toHaveBeenCalled();
    });

    it("suppresses a hard bounce, marks the email bounced and notes it with the reason", async () => {
        await handleResendReport({
            type: "email.bounced",
            data: { ...base, bounce: { type: "Permanent", message: "Mailbox does not exist" } },
        });

        expect(prisma.suppressedEmail.upsert).toHaveBeenCalledWith({
            where: { email: "joe@example.com" },
            create: { email: "joe@example.com", reason: "BOUNCED", detail: "Mailbox does not exist" },
            update: {},
        });
        expect(prisma.emailLog.updateMany).toHaveBeenCalledWith({
            where: { id: "log1", status: { in: ["SENT", "DELIVERED"] } },
            data: { status: "BOUNCED", error: "Mailbox does not exist" },
        });
        expect(logEventOnce).toHaveBeenCalledWith(
            expect.objectContaining({
                type: "EMAIL_BOUNCED",
                detail: {
                    to: "joe@example.com",
                    kind: "WORK_ORDER",
                    reason: "bounced",
                    message: "Mailbox does not exist",
                },
            }),
            "email:log1:bounced",
        );
    });

    it("only notes a temporary bounce, without suppressing or changing the status", async () => {
        await handleResendReport({
            type: "email.bounced",
            data: { ...base, bounce: { type: "Transient", message: "Mailbox full" } },
        });

        expect(prisma.suppressedEmail.upsert).not.toHaveBeenCalled();
        expect(prisma.emailLog.updateMany).toHaveBeenCalledWith({
            where: { id: "log1", status: "SENT" },
            data: { error: "Temporary bounce: Mailbox full" },
        });
        expect(logEventOnce).not.toHaveBeenCalled();
    });

    it("suppresses a spam complaint, which outranks an earlier bounce", async () => {
        await handleResendReport({ type: "email.complained", data: base });

        expect(prisma.suppressedEmail.upsert).toHaveBeenCalledWith({
            where: { email: "joe@example.com" },
            create: { email: "joe@example.com", reason: "COMPLAINED", detail: null },
            update: { reason: "COMPLAINED" },
        });
        expect(prisma.emailLog.updateMany).toHaveBeenCalledWith({
            where: { id: "log1", status: { in: ["SENT", "DELIVERED", "BOUNCED"] } },
            data: { status: "COMPLAINED" },
        });
        expect(logEventOnce).toHaveBeenCalledWith(
            expect.objectContaining({
                type: "EMAIL_BOUNCED",
                detail: expect.objectContaining({ reason: "complained" }),
            }),
            "email:log1:complained",
        );
    });

    it("still suppresses a bounced address Praedium has no log for", async () => {
        vi.mocked(prisma.emailLog.findUnique).mockResolvedValue(null);

        await handleResendReport({ type: "email.bounced", data: { ...base, bounce: { type: "Permanent" } } });

        expect(prisma.suppressedEmail.upsert).toHaveBeenCalledOnce();
        expect(prisma.emailLog.updateMany).not.toHaveBeenCalled();
    });

    it("updates an email with no work order without logging Activity", async () => {
        vi.mocked(prisma.emailLog.findUnique).mockResolvedValue({ ...log, workOrderId: null } as never);

        await handleResendReport({ type: "email.complained", data: base });

        expect(prisma.emailLog.updateMany).toHaveBeenCalled();
        expect(logEventOnce).not.toHaveBeenCalled();
    });

    it("ignores other report types", async () => {
        await handleResendReport({ type: "email.opened", data: base });
        expect(prisma.emailLog.findUnique).not.toHaveBeenCalled();
    });
});
