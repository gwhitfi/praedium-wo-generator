import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
    default: {
        suppressedEmail: { findUnique: vi.fn() },
        organization: { findUnique: vi.fn() },
        emailLog: { create: vi.fn() },
    },
}));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/rateLimit", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/rateLimit")>()),
    rateLimit: vi.fn(),
}));

import { Prisma } from "@/generated/prisma/client";
import { sendEmail } from "@/lib/email";
import prisma from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";
import { EmailNotSent, sendLoggedEmail } from "./emailLog";

const DAY_MS = 24 * 60 * 60 * 1000;
const email = {
    organizationId: "org1",
    kind: "WORK_ORDER" as const,
    workOrderId: "wo1",
    to: "  Joe@Example.com ",
    subject: "Work order 2026-1001",
    html: "<p>h</p>",
    text: "t",
    replyTo: "office@acme.test",
    fromName: "Acme Property",
};

function logged() {
    return vi.mocked(prisma.emailLog.create).mock.calls.map((call) => call[0].data);
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.suppressedEmail.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({
        createdAt: new Date(Date.now() - 30 * DAY_MS),
        deletedAt: null,
    } as never);
    vi.mocked(rateLimit).mockResolvedValue({ ok: true, remaining: 10, retryAfterSeconds: 0 });
    vi.mocked(sendEmail).mockResolvedValue({ id: "re_123" } as never);
    vi.mocked(prisma.emailLog.create).mockResolvedValue({} as never);
});

describe("sendLoggedEmail", () => {
    it("sends to the normalized address and logs it as sent with Resend's id", async () => {
        expect(await sendLoggedEmail(email)).toEqual({ resendId: "re_123" });

        expect(sendEmail).toHaveBeenCalledWith({
            to: "joe@example.com",
            subject: "Work order 2026-1001",
            html: "<p>h</p>",
            text: "t",
            replyTo: "office@acme.test",
            fromName: "Acme Property",
        });
        expect(logged()).toEqual([
            {
                organizationId: "org1",
                workOrderId: "wo1",
                kind: "WORK_ORDER",
                to: "joe@example.com",
                subject: "Work order 2026-1001",
                status: "SENT",
                resendId: "re_123",
                error: null,
            },
        ]);
        expect(rateLimit).toHaveBeenCalledWith("email-day:org1", { limit: 200, windowSeconds: 86400 });
    });

    it("gives an organization in its first day the smaller allowance", async () => {
        vi.mocked(prisma.organization.findUnique).mockResolvedValue({
            createdAt: new Date(Date.now() - 60 * 60 * 1000),
            deletedAt: null,
        } as never);

        await sendLoggedEmail(email);

        expect(rateLimit).toHaveBeenCalledWith("email-new:org1", { limit: 25, windowSeconds: 86400 });
    });

    it("refuses a suppressed address before counting it, and logs why", async () => {
        vi.mocked(prisma.suppressedEmail.findUnique).mockResolvedValue({
            email: "joe@example.com",
            reason: "BOUNCED",
            detail: null,
            createdAt: new Date("2026-11-03T15:00:00Z"),
        } as never);

        const sent = sendLoggedEmail(email);
        await expect(sent).rejects.toBeInstanceOf(EmailNotSent);
        await expect(sent).rejects.toThrow(/^Email to joe@example.com bounced on November 3, 2026/);
        expect(sendEmail).not.toHaveBeenCalled();
        expect(rateLimit).not.toHaveBeenCalled();
        expect(logged()[0]).toMatchObject({ status: "SKIPPED", error: expect.stringContaining("bounced") });
    });

    it("explains a spam complaint differently", async () => {
        vi.mocked(prisma.suppressedEmail.findUnique).mockResolvedValue({
            email: "joe@example.com",
            reason: "COMPLAINED",
            detail: null,
            createdAt: new Date("2026-11-03T15:00:00Z"),
        } as never);

        await expect(sendLoggedEmail(email)).rejects.toThrow("joe@example.com marked an earlier email as spam");
    });

    it("refuses over the daily limit, with a message for the office", async () => {
        vi.mocked(rateLimit).mockResolvedValue({ ok: false, remaining: 0, retryAfterSeconds: 3600 });

        await expect(sendLoggedEmail(email)).rejects.toThrow(
            "This organization has sent its 200 emails for today. Try again tomorrow.",
        );
        expect(sendEmail).not.toHaveBeenCalled();
        expect(logged()[0]).toMatchObject({ status: "SKIPPED", error: "Daily email limit reached." });
    });

    it("refuses for a deleted organization", async () => {
        vi.mocked(prisma.organization.findUnique).mockResolvedValue({
            createdAt: new Date(Date.now() - 30 * DAY_MS),
            deletedAt: new Date(),
        } as never);

        await expect(sendLoggedEmail(email)).rejects.toBeInstanceOf(EmailNotSent);
        expect(sendEmail).not.toHaveBeenCalled();
    });

    it("still refuses other emails for a locked organization, and logs why", async () => {
        vi.mocked(prisma.organization.findUnique).mockResolvedValue({
            createdAt: new Date(Date.now() - 30 * DAY_MS),
            deletedAt: new Date(),
        } as never);

        for (const kind of ["WORK_ORDER", "TENANT_NOTICE", "CANCELLED", "COMPLETED", "VERIFY_CODE"] as const) {
            await expect(sendLoggedEmail({ ...email, kind })).rejects.toThrow("This organization was deleted.");
        }
        expect(sendEmail).not.toHaveBeenCalled();
        expect(logged().every((row) => row.status === "SKIPPED")).toBe(true);
    });

    describe("the deletion notice to admins", () => {
        const notice = { ...email, kind: "ORGANIZATION_DELETED" as const, workOrderId: null };

        beforeEach(() => {
            vi.mocked(prisma.organization.findUnique).mockResolvedValue({
                createdAt: new Date(Date.now() - 30 * DAY_MS),
                deletedAt: new Date(),
            } as never);
        });

        it("is sent for a locked organization without counting against the daily allowance", async () => {
            vi.mocked(rateLimit).mockResolvedValue({ ok: false, remaining: 0, retryAfterSeconds: 3600 });

            expect(await sendLoggedEmail(notice)).toEqual({ resendId: "re_123" });
            expect(sendEmail).toHaveBeenCalledOnce();
            expect(rateLimit).not.toHaveBeenCalled();
            expect(logged()[0]).toMatchObject({ kind: "ORGANIZATION_DELETED", status: "SENT" });
        });

        it("is still refused for a suppressed address, and logged", async () => {
            vi.mocked(prisma.suppressedEmail.findUnique).mockResolvedValue({
                email: "joe@example.com",
                reason: "BOUNCED",
                detail: null,
                createdAt: new Date("2026-11-03T15:00:00Z"),
            } as never);

            await expect(sendLoggedEmail(notice)).rejects.toBeInstanceOf(EmailNotSent);
            expect(sendEmail).not.toHaveBeenCalled();
            expect(logged()[0]).toMatchObject({ kind: "ORGANIZATION_DELETED", status: "SKIPPED" });
        });

        it("is refused once the organization is gone", async () => {
            vi.mocked(prisma.organization.findUnique).mockResolvedValue(null);

            await expect(sendLoggedEmail(notice)).rejects.toThrow("This organization was deleted.");
            expect(sendEmail).not.toHaveBeenCalled();
        });
    });

    it("logs a Resend failure and passes the error on", async () => {
        vi.mocked(sendEmail).mockRejectedValue(new Error("Email failed to send: invalid domain"));

        await expect(sendLoggedEmail(email)).rejects.toThrow("invalid domain");
        expect(logged()[0]).toMatchObject({ status: "FAILED", error: "Email failed to send: invalid domain" });
    });

    it("still sends when the log can't be written", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        vi.mocked(prisma.emailLog.create).mockRejectedValue(new Error("database hiccup"));

        expect(await sendLoggedEmail(email)).toEqual({ resendId: "re_123" });
    });

    it("keeps the log without the work order link when the work order was deleted meanwhile", async () => {
        const missing = new Prisma.PrismaClientKnownRequestError("fk", { code: "P2003", clientVersion: "7" });
        vi.mocked(prisma.emailLog.create).mockRejectedValueOnce(missing);

        await sendLoggedEmail({ ...email, kind: "CANCELLED" });

        expect(logged()).toHaveLength(2);
        expect(logged()[1]).toMatchObject({ workOrderId: null, kind: "CANCELLED", status: "SENT" });
    });
});
