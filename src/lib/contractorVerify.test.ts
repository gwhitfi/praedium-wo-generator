import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
    default: {
        contractorChallenge: { create: vi.fn(), delete: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    },
}));
vi.mock("@/lib/emailLog", () => ({ sendLoggedEmail: vi.fn(), EmailNotSent: class EmailNotSent extends Error {} }));
vi.mock("@/lib/emails/verifyCodeEmail", () => ({
    verifyCodeEmail: vi.fn(() => ({ subject: "s", html: "h", text: "t" })),
}));
vi.mock("@/lib/rateLimit", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/rateLimit")>()),
    rateLimit: vi.fn(),
}));

import { EmailNotSent, sendLoggedEmail } from "@/lib/emailLog";
import { verifyCodeEmail } from "@/lib/emails/verifyCodeEmail";
import prisma from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";
import { checkCode, generateCode, hashCode, startVerification } from "./contractorVerify";

const sendEmail = vi.mocked(sendLoggedEmail);
const workOrder = { id: "wo1", publicToken: "tok1", jobNumber: "2026-1001", contractorEmail: " Sam@Example.com " };
const organization = { id: "org1", name: "Acme Property", email: "office@acme.test" };
const ok = { ok: true, remaining: 1, retryAfterSeconds: 0 };
const limited = { ok: false, remaining: 0, retryAfterSeconds: 60 };
const start = { workOrder, organization, appUrl: "https://example.com", ip: "203.0.113.7" };

function createdData() {
    return vi.mocked(prisma.contractorChallenge.create).mock.calls[0][0].data as {
        id: string;
        email: string;
        codeHash: string;
        expiresAt: Date;
        workOrderId: string;
    };
}

function withChallenge(overrides: Record<string, unknown> = {}) {
    vi.mocked(prisma.contractorChallenge.findUnique).mockResolvedValue({
        id: "ch1",
        workOrderId: "wo1",
        email: "sam@example.com",
        codeHash: hashCode("123456", "ch1"),
        attempts: 0,
        consumedAt: null,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        ...overrides,
    } as never);
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(rateLimit).mockResolvedValue({ ok: true, remaining: 1, retryAfterSeconds: 0 });
    vi.mocked(prisma.contractorChallenge.updateMany).mockResolvedValue({ count: 1 } as never);
    withChallenge();
});

describe("generateCode", () => {
    it("is six digits", () => {
        for (let i = 0; i < 20; i++) expect(generateCode()).toMatch(/^\d{6}$/);
    });
});

describe("startVerification", () => {
    it("stores a hash of the code with a 10-minute expiry and emails the normalized address", async () => {
        const before = Date.now();
        const result = await startVerification(start);

        const data = createdData();
        expect(result).toEqual({ challengeId: data.id });
        expect(data.email).toBe("sam@example.com");
        expect(data.workOrderId).toBe("wo1");
        const code = vi.mocked(verifyCodeEmail).mock.calls[0][0].code;
        expect(code).toMatch(/^\d{6}$/);
        expect(data.codeHash).not.toBe(code);
        expect(data.codeHash).toBe(hashCode(code, data.id));
        expect(data.expiresAt.getTime() - before).toBeGreaterThanOrEqual(10 * 60 * 1000);
        expect(data.expiresAt.getTime() - before).toBeLessThan(10 * 60 * 1000 + 5000);

        expect(verifyCodeEmail).toHaveBeenCalledWith({
            organizationName: "Acme Property",
            jobNumber: "2026-1001",
            code,
            url: `https://example.com/wo/tok1/verify?c=${data.id}.${code}`,
        });
        expect(sendEmail).toHaveBeenCalledWith(
            expect.objectContaining({
                organizationId: "org1",
                kind: "VERIFY_CODE",
                workOrderId: "wo1",
                to: "sam@example.com",
                fromName: "Acme Property",
                replyTo: "office@acme.test",
            }),
        );
        expect(rateLimit).toHaveBeenCalledWith("verify-send:tok1", expect.any(Object));
        expect(rateLimit).toHaveBeenCalledWith("verify-day:tok1", { limit: 20, windowSeconds: 86400 });
        expect(rateLimit).toHaveBeenCalledWith("verify-ip:203.0.113.7", expect.any(Object));
        expect(rateLimit).toHaveBeenCalledWith("verify-email:sam@example.com", { limit: 10, windowSeconds: 86400 });
    });

    it("refuses without creating a row when rate limited", async () => {
        vi.mocked(rateLimit).mockResolvedValue({ ok: false, remaining: 0, retryAfterSeconds: 60 });

        expect(await startVerification(start)).toEqual({ error: "Too many codes sent. Try again later." });
        expect(prisma.contractorChallenge.create).not.toHaveBeenCalled();
        expect(sendEmail).not.toHaveBeenCalled();
    });

    it("refuses when only the link's daily limit is reached, before the per-IP check", async () => {
        vi.mocked(rateLimit).mockResolvedValueOnce(ok).mockResolvedValueOnce(limited);

        expect(await startVerification(start)).toEqual({ error: "Too many codes sent. Try again later." });
        expect(rateLimit).toHaveBeenLastCalledWith("verify-day:tok1", expect.any(Object));
        expect(prisma.contractorChallenge.create).not.toHaveBeenCalled();
    });

    it("refuses when only the per-IP limit is reached, before the per-email check", async () => {
        vi.mocked(rateLimit).mockResolvedValueOnce(ok).mockResolvedValueOnce(ok).mockResolvedValueOnce(limited);

        expect(await startVerification(start)).toEqual({ error: "Too many codes sent. Try again later." });
        expect(rateLimit).toHaveBeenLastCalledWith("verify-ip:203.0.113.7", expect.any(Object));
        expect(prisma.contractorChallenge.create).not.toHaveBeenCalled();
    });

    it("refuses when only the per-email limit is reached", async () => {
        vi.mocked(rateLimit)
            .mockResolvedValueOnce(ok)
            .mockResolvedValueOnce(ok)
            .mockResolvedValueOnce(ok)
            .mockResolvedValueOnce(limited);

        expect(await startVerification(start)).toEqual({ error: "Too many codes sent. Try again later." });
        expect(prisma.contractorChallenge.create).not.toHaveBeenCalled();
    });

    it("tells the contractor to ask the office, without the office's reason, when the email is refused", async () => {
        sendEmail.mockRejectedValue(new EmailNotSent("Email to sam@example.com bounced on November 3, 2026"));
        vi.mocked(prisma.contractorChallenge.delete).mockResolvedValue({} as never);
        vi.spyOn(console, "error").mockImplementation(() => {});

        expect(await startVerification(start)).toEqual({
            error: "Couldn't send a code to the email on file. Ask the office to check it.",
        });
        expect(prisma.contractorChallenge.delete).toHaveBeenCalled();
    });

    it("doesn't show the contractor Praedium's daily limit either", async () => {
        sendEmail.mockRejectedValue(
            new EmailNotSent(
                "Praedium can't send more email today. Try again tomorrow, or copy the work order link and send it yourself.",
            ),
        );
        vi.mocked(prisma.contractorChallenge.delete).mockResolvedValue({} as never);
        vi.spyOn(console, "error").mockImplementation(() => {});

        expect(await startVerification(start)).toEqual({
            error: "Couldn't send a code to the email on file. Ask the office to check it.",
        });
    });

    it("deletes the row and reports an error when the email fails", async () => {
        sendEmail.mockRejectedValue(new Error("Resend down"));
        vi.mocked(prisma.contractorChallenge.delete).mockResolvedValue({} as never);
        vi.spyOn(console, "error").mockImplementation(() => {});

        expect(await startVerification(start)).toEqual({ error: "Couldn't send the email. Try again." });
        expect(prisma.contractorChallenge.delete).toHaveBeenCalledWith({ where: { id: createdData().id } });
    });

    it("refuses a work order without a contractor email", async () => {
        const result = await startVerification({ ...start, workOrder: { ...workOrder, contractorEmail: null } });
        expect(result).toEqual({ error: "This work order has no contractor email on file." });
        expect(prisma.contractorChallenge.create).not.toHaveBeenCalled();
    });
});

describe("checkCode", () => {
    const check = { workOrderId: "wo1", challengeId: "ch1", code: "123456" };

    it("refuses a challenge of another work order", async () => {
        withChallenge({ workOrderId: "wo2" });
        expect(await checkCode(check)).toMatchObject({ ok: false });
        expect(prisma.contractorChallenge.updateMany).not.toHaveBeenCalled();
    });

    it("refuses an expired challenge", async () => {
        withChallenge({ expiresAt: new Date(Date.now() - 1000) });
        expect(await checkCode(check)).toEqual({ ok: false, error: "That code has expired. Send a new one." });
    });

    it("refuses a consumed challenge", async () => {
        withChallenge({ consumedAt: new Date() });
        expect(await checkCode(check)).toEqual({ ok: false, error: "That code has expired. Send a new one." });
    });

    it("refuses after 5 attempts", async () => {
        withChallenge({ attempts: 5 });
        expect(await checkCode(check)).toEqual({ ok: false, error: "Too many wrong attempts. Send a new code." });
        expect(prisma.contractorChallenge.updateMany).not.toHaveBeenCalled();
    });

    it("counts a wrong code and says how many attempts are left, without consuming", async () => {
        withChallenge({ attempts: 1 });

        expect(await checkCode({ ...check, code: "654321" })).toEqual({
            ok: false,
            error: "That code isn't right. 3 attempts left.",
        });
        expect(prisma.contractorChallenge.updateMany).toHaveBeenCalledTimes(1);
        expect(prisma.contractorChallenge.updateMany).toHaveBeenCalledWith({
            where: { id: "ch1", consumedAt: null, expiresAt: { gt: expect.any(Date) }, attempts: { lt: 5 } },
            data: { attempts: { increment: 1 } },
        });
    });

    it("accepts the right code and consumes the challenge", async () => {
        expect(await checkCode(check)).toEqual({ ok: true, email: "sam@example.com" });
        expect(prisma.contractorChallenge.updateMany).toHaveBeenLastCalledWith({
            where: { id: "ch1", consumedAt: null, expiresAt: { gt: expect.any(Date) } },
            data: { consumedAt: expect.any(Date) },
        });
    });

    it("refuses when the challenge expired between the read and the consume", async () => {
        vi.mocked(prisma.contractorChallenge.updateMany)
            .mockResolvedValueOnce({ count: 1 } as never)
            .mockResolvedValueOnce({ count: 0 } as never);
        expect(await checkCode(check)).toEqual({ ok: false, error: "That code has expired. Send a new one." });
    });

    it("refuses when a parallel attempt used up the last try", async () => {
        vi.mocked(prisma.contractorChallenge.updateMany).mockResolvedValue({ count: 0 } as never);
        expect(await checkCode(check)).toEqual({ ok: false, error: "Too many wrong attempts. Send a new code." });
    });
});
