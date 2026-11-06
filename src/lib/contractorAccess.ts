// Server-only. Contractor sessions: a verified browser holds a random key in the `praedium_contractor` cookie, and
// the `ContractorSession` row it points at says which email it proved. The database decides expiry (30 days from
// last use); the cookie is only a key. Verification itself is in src/lib/contractorVerify.ts.
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import prisma from "@/lib/prisma";
import { normalizeEmail } from "@/lib/contractorWorkOrders";

export const CONTRACTOR_COOKIE = "praedium_contractor";
export const SESSION_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;
const COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
const MAX_USER_AGENT_LENGTH = 500;

export function hashSessionToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

export type ContractorSessionInfo = { id: string; email: string };

// The browser's live session, or null when there's no cookie or the session is unknown, revoked or expired. A
// session used more than a day ago is extended to 30 days from now. Never throws.
export async function getContractorSession(): Promise<ContractorSessionInfo | null> {
    try {
        const token = (await cookies()).get(CONTRACTOR_COOKIE)?.value;
        if (!token) return null;

        const session = await prisma.contractorSession.findUnique({ where: { tokenHash: hashSessionToken(token) } });
        const now = new Date();
        if (!session || session.revokedAt || session.expiresAt <= now) return null;

        if (now.getTime() - session.lastUsedAt.getTime() > DAY_MS) {
            await prisma.contractorSession.update({
                where: { id: session.id },
                data: { lastUsedAt: now, expiresAt: new Date(now.getTime() + SESSION_DAYS * DAY_MS) },
            });
        }
        return { id: session.id, email: session.email };
    } catch (error) {
        console.error("getContractorSession failed", error);
        return null;
    }
}

// True when this browser's session proved the work order's contractor email. A work order without a contractor
// email can't be verified.
export async function isVerifiedFor(workOrder: { contractorEmail: string | null }): Promise<boolean> {
    if (!workOrder.contractorEmail) return false;
    const session = await getContractorSession();
    return session !== null && session.email === normalizeEmail(workOrder.contractorEmail);
}

// Stores a new session (only the token's hash) and returns the token for the caller to put in the cookie.
export async function createContractorSession(input: {
    email: string;
    remember: boolean;
    userAgent: string | null;
}): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_DAYS * DAY_MS);
    await prisma.contractorSession.create({
        data: {
            tokenHash: hashSessionToken(token),
            email: normalizeEmail(input.email),
            remember: input.remember,
            userAgent: input.userAgent?.slice(0, MAX_USER_AGENT_LENGTH) ?? null,
            expiresAt,
        },
    });
    return { token, expiresAt };
}

// For cookies().set(CONTRACTOR_COOKIE, token, options) in a Server Action. Without "remember", the cookie ends with
// the browser session; either way the database row still expires 30 days after last use.
export function sessionCookieOptions(remember: boolean): {
    httpOnly: true;
    secure: boolean;
    sameSite: "lax";
    path: "/wo";
    maxAge?: number;
} {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/wo",
        ...(remember ? { maxAge: COOKIE_MAX_AGE_SECONDS } : {}),
    };
}

// Signs the contractor out everywhere: revokes every unrevoked session for the email. Returns how many.
export async function revokeContractorSessions(email: string): Promise<number> {
    const result = await prisma.contractorSession.updateMany({
        where: { email: normalizeEmail(email), revokedAt: null },
        data: { revokedAt: new Date() },
    });
    return result.count;
}

// Live sessions (not revoked, not expired) for an email.
export async function countContractorSessions(email: string): Promise<number> {
    return prisma.contractorSession.count({
        where: { email: normalizeEmail(email), revokedAt: null, expiresAt: { gt: new Date() } },
    });
}
