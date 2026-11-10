// Server-only. Contractor verification: a 6-digit code emailed to the work order's contractor address
// (`ContractorChallenge`). Only the code's scrypt hash is stored, salted with the challenge id. A challenge lasts
// 10 minutes and allows 5 attempts. Sessions for a verified browser are in src/lib/contractorAccess.ts.
import { randomInt, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import prisma from "@/lib/prisma";
import { EmailNotSent, sendLoggedEmail } from "@/lib/emailLog";
import { verifyCodeEmail } from "@/lib/emails/verifyCodeEmail";
import { normalizeEmail } from "@/lib/contractorWorkOrders";
import { RATE_LIMITS, rateLimit } from "@/lib/rateLimit";

export const CODE_LENGTH = 6;
export const CHALLENGE_MINUTES = 10;
export const MAX_ATTEMPTS = 5;

const TOO_MANY_SENT = "Too many codes sent. Try again later.";
const EXPIRED = "That code has expired. Send a new one.";
const TOO_MANY_ATTEMPTS = "Too many wrong attempts. Send a new code.";

export function hashCode(code: string, challengeId: string): string {
    return scryptSync(code, challengeId, 32).toString("hex");
}

export function generateCode(): string {
    return randomInt(0, 1_000_000).toString().padStart(CODE_LENGTH, "0");
}

// Creates a challenge for the work order's contractor email and emails the code with a link to the confirm page
// (`/wo/[token]/verify?c=<challengeId>.<code>`). Rate limited per token, per IP and per email. If the email can't be
// sent, the challenge is deleted again.
export async function startVerification(input: {
    workOrder: { id: string; publicToken: string; jobNumber: string; contractorEmail: string | null };
    organization: { id: string; name: string; email: string | null };
    appUrl: string;
    ip: string;
}): Promise<{ challengeId: string } | { error: string }> {
    const { workOrder, organization } = input;
    if (!workOrder.contractorEmail) return { error: "This work order has no contractor email on file." };
    const email = normalizeEmail(workOrder.contractorEmail);

    const perToken = await rateLimit(`verify-send:${workOrder.publicToken}`, RATE_LIMITS.verifySend);
    if (!perToken.ok) return { error: TOO_MANY_SENT };
    const perTokenDay = await rateLimit(`verify-day:${workOrder.publicToken}`, RATE_LIMITS.verifyTokenDay);
    if (!perTokenDay.ok) return { error: TOO_MANY_SENT };
    const perIp = await rateLimit(`verify-ip:${input.ip}`, RATE_LIMITS.verifyIp);
    if (!perIp.ok) return { error: TOO_MANY_SENT };
    const perEmail = await rateLimit(`verify-email:${email}`, RATE_LIMITS.verifyEmail);
    if (!perEmail.ok) return { error: TOO_MANY_SENT };

    // The id is made here so the code can be hashed with it before the insert.
    const challengeId = randomUUID();
    const code = generateCode();
    await prisma.contractorChallenge.create({
        data: {
            id: challengeId,
            email,
            codeHash: hashCode(code, challengeId),
            expiresAt: new Date(Date.now() + CHALLENGE_MINUTES * 60 * 1000),
            workOrderId: workOrder.id,
        },
    });

    try {
        const url = `${input.appUrl}/wo/${workOrder.publicToken}/verify?c=${challengeId}.${code}`;
        await sendLoggedEmail({
            organizationId: organization.id,
            kind: "VERIFY_CODE",
            workOrderId: workOrder.id,
            to: email,
            ...verifyCodeEmail({ organizationName: organization.name, jobNumber: workOrder.jobNumber, code, url }),
            fromName: organization.name,
            replyTo: organization.email,
        });
    } catch (error) {
        console.error(`Verification email failed for work order ${workOrder.id}`, error);
        await prisma.contractorChallenge.delete({ where: { id: challengeId } }).catch(() => {});
        // Refused, not failed (a bounced address or the organization's daily limit): retrying won't help, and the
        // reason is for the office, not whoever holds the link.
        if (error instanceof EmailNotSent) {
            return { error: "Couldn't send a code to the email on file. Ask the office to check it." };
        }
        return { error: "Couldn't send the email. Try again." };
    }

    return { challengeId };
}

// Checks a code against a challenge of this work order. The attempt is counted (atomically, so parallel guesses
// can't exceed the limit) before the hashes are compared. On success the challenge is consumed and the email it was
// sent to is returned.
export async function checkCode(input: {
    workOrderId: string;
    challengeId: string;
    code: string;
}): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
    const challenge = await prisma.contractorChallenge.findUnique({ where: { id: input.challengeId } });
    if (!challenge || challenge.workOrderId !== input.workOrderId) {
        return { ok: false, error: "That code isn't valid. Send a new one." };
    }
    const now = new Date();
    if (challenge.consumedAt || challenge.expiresAt <= now) return { ok: false, error: EXPIRED };
    if (challenge.attempts >= MAX_ATTEMPTS) return { ok: false, error: TOO_MANY_ATTEMPTS };

    const counted = await prisma.contractorChallenge.updateMany({
        where: { id: challenge.id, consumedAt: null, expiresAt: { gt: now }, attempts: { lt: MAX_ATTEMPTS } },
        data: { attempts: { increment: 1 } },
    });
    if (counted.count === 0) return { ok: false, error: TOO_MANY_ATTEMPTS };

    const expected = Buffer.from(challenge.codeHash, "hex");
    const actual = Buffer.from(hashCode(input.code, challenge.id), "hex");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
        const left = MAX_ATTEMPTS - (challenge.attempts + 1);
        if (left <= 0) return { ok: false, error: TOO_MANY_ATTEMPTS };
        return { ok: false, error: `That code isn't right. ${left} ${left === 1 ? "attempt" : "attempts"} left.` };
    }

    // Conditional, so the same code can't be used twice by two requests at once, or after it expired.
    const consumed = await prisma.contractorChallenge.updateMany({
        where: { id: challenge.id, consumedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now },
    });
    if (consumed.count === 0) return { ok: false, error: EXPIRED };

    return { ok: true, email: challenge.email };
}
