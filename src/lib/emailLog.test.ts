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
    peekRateLimit: vi.fn(),
}));
vi.mock("@sentry/nextjs", () => ({ captureMessage: vi.fn(), flush: vi.fn() }));

import * as Sentry from "@sentry/nextjs";
import { Prisma } from "@/generated/prisma/client";
import { sendEmail } from "@/lib/email";
import prisma from "@/lib/prisma";
import { type RateLimitResult, type RateLimitRule, peekRateLimit, rateLimit } from "@/lib/rateLimit";
import { EmailNotSent, sendLoggedEmail } from "./emailLog";

const ACCOUNT_LIMIT =
    "Praedium can't send more email today. Try again tomorrow, or copy the work order link and send it yourself.";
const OFFICE_KINDS = ["WORK_ORDER", "TENANT_NOTICE", "CANCELLED", "COMPLETED"] as const;

// rateLimit() as if each bucket had just counted `counts[key]` (1 when not given), refusing over the rule's limit.
function counts(byKey: Record<string, number> = {}): void {
    vi.mocked(rateLimit).mockImplementation(async (key: string, rule: RateLimitRule): Promise<RateLimitResult> => {
        const count = byKey[key] ?? 1;
        const ok = count <= rule.limit;
        return { ok, remaining: Math.max(0, rule.limit - count), retryAfterSeconds: ok ? 0 : 3600 };
    });
}

function rateLimitKeys(): string[] {
    return vi.mocked(rateLimit).mock.calls.map((call) => call[0]);
}

function today(): string {
    return new Date().toISOString().slice(0, 10);
}

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
    counts();
    vi.mocked(peekRateLimit).mockResolvedValue(0);
    vi.mocked(sendEmail).mockResolvedValue({ id: "re_123" } as never);
    vi.mocked(prisma.emailLog.create).mockResolvedValue({} as never);
    vi.mocked(Sentry.flush).mockResolvedValue(true);
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
        expect(rateLimit).toHaveBeenCalledWith("email-day:org1", { limit: 40, windowSeconds: 86400 });
    });

    it("gives an organization in its first day the smaller allowance", async () => {
        vi.mocked(prisma.organization.findUnique).mockResolvedValue({
            createdAt: new Date(Date.now() - 60 * 60 * 1000),
            deletedAt: null,
        } as never);

        await sendLoggedEmail(email);

        expect(rateLimit).toHaveBeenCalledWith("email-new:org1", { limit: 10, windowSeconds: 86400 });
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
        await expect(sent).rejects.toThrow(/ If this is a mistake, email support@praediumhq\.com\.$/);
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

        await expect(sendLoggedEmail(email)).rejects.toThrow(
            "joe@example.com marked an earlier email as spam on November 3, 2026, so Praedium won't email it again. If this is a mistake, email support@praediumhq.com.",
        );
    });

    it("refuses over the daily limit, with a message for the office", async () => {
        counts({ "email-day:org1": 41 });

        await expect(sendLoggedEmail(email)).rejects.toThrow(
            "This organization has sent its 40 emails for today. Try again tomorrow.",
        );
        expect(sendEmail).not.toHaveBeenCalled();
        expect(logged()[0]).toMatchObject({ status: "SKIPPED", error: "Daily email limit reached." });
    });

    it("refuses a new organization over its first-day limit", async () => {
        vi.mocked(prisma.organization.findUnique).mockResolvedValue({
            createdAt: new Date(Date.now() - 60 * 60 * 1000),
            deletedAt: null,
        } as never);
        counts({ "email-new:org1": 11 });

        await expect(sendLoggedEmail(email)).rejects.toThrow(
            "New organizations can send 10 emails in their first day. Try again tomorrow.",
        );
        expect(sendEmail).not.toHaveBeenCalled();
    });

    describe("the per-recipient cap", () => {
        it("counts each address per organization, after normalizing it", async () => {
            await sendLoggedEmail(email);

            expect(rateLimit).toHaveBeenCalledWith("email-to:org1:joe@example.com", {
                limit: 10,
                windowSeconds: 86400,
            });
        });

        it("refuses the 11th email to one address in a day, with a message for the office", async () => {
            counts({ "email-to:org1:joe@example.com": 11 });

            await expect(sendLoggedEmail(email)).rejects.toThrow(
                "joe@example.com has already been sent 10 emails from this organization today. Try again tomorrow.",
            );
            expect(sendEmail).not.toHaveBeenCalled();
            expect(logged()[0]).toMatchObject({ status: "SKIPPED", error: "Daily limit for this recipient reached." });
            expect(rateLimitKeys()).not.toContain("email-account");
        });

        it("isn't checked when the organization's allowance already refused", async () => {
            counts({ "email-day:org1": 41 });

            await expect(sendLoggedEmail(email)).rejects.toBeInstanceOf(EmailNotSent);
            expect(rateLimitKeys()).toEqual(["email-day:org1"]);
        });
    });

    describe("the account's daily ceiling", () => {
        it("lets the office send while the day's total is under 80", async () => {
            vi.mocked(peekRateLimit).mockResolvedValue(79);

            expect(await sendLoggedEmail(email)).toEqual({ resendId: "re_123" });
            expect(peekRateLimit).toHaveBeenCalledWith("email-account");
        });

        it("refuses every office kind once the day's total reaches 80, and logs why", async () => {
            vi.mocked(peekRateLimit).mockResolvedValue(80);

            for (const kind of OFFICE_KINDS) {
                await expect(sendLoggedEmail({ ...email, kind })).rejects.toThrow(ACCOUNT_LIMIT);
            }
            expect(sendEmail).not.toHaveBeenCalled();
            expect(logged()).toHaveLength(OFFICE_KINDS.length);
            expect(logged().every((row) => row.status === "SKIPPED")).toBe(true);
            expect(logged()[0].error).toBe("Praedium's daily email limit reached.");
        });

        it("still sends verification codes and deletion notices up to 90", async () => {
            vi.mocked(peekRateLimit).mockResolvedValue(89);
            vi.mocked(prisma.organization.findUnique).mockResolvedValue({
                createdAt: new Date(Date.now() - 30 * DAY_MS),
                deletedAt: null,
            } as never);

            expect(await sendLoggedEmail({ ...email, kind: "VERIFY_CODE" })).toEqual({ resendId: "re_123" });
            expect(await sendLoggedEmail({ ...email, kind: "ORGANIZATION_DELETED" })).toEqual({ resendId: "re_123" });
            expect(sendEmail).toHaveBeenCalledTimes(2);
        });

        it("refuses verification codes and deletion notices at 90", async () => {
            vi.mocked(peekRateLimit).mockResolvedValue(90);

            await expect(sendLoggedEmail({ ...email, kind: "VERIFY_CODE" })).rejects.toThrow(ACCOUNT_LIMIT);
            await expect(sendLoggedEmail({ ...email, kind: "ORGANIZATION_DELETED" })).rejects.toThrow(ACCOUNT_LIMIT);
            expect(sendEmail).not.toHaveBeenCalled();
        });

        it("counts an email only once Resend accepted it", async () => {
            await sendLoggedEmail(email);

            expect(rateLimit).toHaveBeenLastCalledWith("email-account", { limit: 90, windowSeconds: 86400 });
            const accountCall = vi.mocked(rateLimit).mock.invocationCallOrder[rateLimitKeys().indexOf("email-account")];
            expect(accountCall).toBeGreaterThan(vi.mocked(sendEmail).mock.invocationCallOrder[0]);
        });

        it("doesn't count a refused send", async () => {
            vi.mocked(peekRateLimit).mockResolvedValue(80);

            await expect(sendLoggedEmail(email)).rejects.toBeInstanceOf(EmailNotSent);
            expect(rateLimitKeys()).not.toContain("email-account");
        });

        it("doesn't count a send Resend failed", async () => {
            vi.mocked(sendEmail).mockRejectedValue(new Error("Email failed to send: invalid domain"));

            await expect(sendLoggedEmail(email)).rejects.toThrow("invalid domain");
            expect(rateLimitKeys()).not.toContain("email-account");
        });

        it("doesn't count a send refused for the organization's allowance", async () => {
            counts({ "email-day:org1": 41 });

            await expect(sendLoggedEmail(email)).rejects.toBeInstanceOf(EmailNotSent);
            expect(peekRateLimit).not.toHaveBeenCalled();
            expect(rateLimitKeys()).not.toContain("email-account");
        });
    });

    describe("alerts to the owner", () => {
        it("warns once the day's total reaches 70, and flushes the event", async () => {
            counts({ "email-account": 70 });

            await sendLoggedEmail(email);

            expect(rateLimit).toHaveBeenCalledWith("email-alert-warning", { limit: 1, windowSeconds: 86400 });
            expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
            expect(Sentry.captureMessage).toHaveBeenCalledWith(expect.stringContaining("sent 70 emails today"), {
                level: "warning",
                fingerprint: ["email-account-warning", today()],
            });
            expect(Sentry.flush).toHaveBeenCalledWith(2000);
        });

        it("doesn't warn below 70", async () => {
            counts({ "email-account": 69 });

            await sendLoggedEmail(email);

            expect(rateLimitKeys()).not.toContain("email-alert-warning");
            expect(Sentry.captureMessage).not.toHaveBeenCalled();
        });

        it("warns at most once a day", async () => {
            counts({ "email-account": 75, "email-alert-warning": 2 });

            await sendLoggedEmail(email);

            expect(Sentry.captureMessage).not.toHaveBeenCalled();
            expect(Sentry.flush).not.toHaveBeenCalled();
        });

        it("reports the first refusal at the ceiling as an error", async () => {
            vi.mocked(peekRateLimit).mockResolvedValue(80);

            await expect(sendLoggedEmail(email)).rejects.toThrow(ACCOUNT_LIMIT);

            expect(rateLimit).toHaveBeenCalledWith("email-alert-ceiling", { limit: 1, windowSeconds: 86400 });
            expect(Sentry.captureMessage).toHaveBeenCalledWith(expect.stringContaining("stopped sending email"), {
                level: "error",
                fingerprint: ["email-account-ceiling", today()],
            });
            expect(Sentry.flush).toHaveBeenCalledWith(2000);
        });

        it("reports the ceiling at most once a day", async () => {
            vi.mocked(peekRateLimit).mockResolvedValue(80);
            counts({ "email-alert-ceiling": 2 });

            await expect(sendLoggedEmail(email)).rejects.toThrow(ACCOUNT_LIMIT);
            expect(Sentry.captureMessage).not.toHaveBeenCalled();
        });

        it("still returns the sent email when Sentry fails", async () => {
            vi.spyOn(console, "error").mockImplementation(() => {});
            counts({ "email-account": 72 });
            vi.mocked(Sentry.flush).mockRejectedValue(new Error("network"));

            expect(await sendLoggedEmail(email)).toEqual({ resendId: "re_123" });
        });
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

        it("is sent for a locked organization without the organization's or the recipient's allowance", async () => {
            counts({ "email-day:org1": 41, "email-to:org1:joe@example.com": 11 });

            expect(await sendLoggedEmail(notice)).toEqual({ resendId: "re_123" });
            expect(sendEmail).toHaveBeenCalledOnce();
            // Only the account's total, after the send.
            expect(rateLimitKeys()).toEqual(["email-account"]);
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
