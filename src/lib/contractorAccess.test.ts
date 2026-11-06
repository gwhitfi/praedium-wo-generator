import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
    default: {
        contractorSession: {
            findUnique: vi.fn(),
            update: vi.fn(),
            create: vi.fn(),
            updateMany: vi.fn(),
            count: vi.fn(),
        },
    },
}));

import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import prisma from "@/lib/prisma";
import {
    CONTRACTOR_COOKIE,
    countContractorSessions,
    createContractorSession,
    getContractorSession,
    hashSessionToken,
    isVerifiedFor,
    revokeContractorSessions,
    sessionCookieOptions,
} from "./contractorAccess";

const DAY_MS = 24 * 60 * 60 * 1000;
const cookieGet = vi.fn();

function withCookie(value: string | undefined) {
    cookieGet.mockImplementation((name: string) => (name === CONTRACTOR_COOKIE && value ? { name, value } : undefined));
}

function withSession(overrides: Record<string, unknown> = {}) {
    vi.mocked(prisma.contractorSession.findUnique).mockResolvedValue({
        id: "s1",
        email: "sam@example.com",
        revokedAt: null,
        expiresAt: new Date(Date.now() + 10 * DAY_MS),
        lastUsedAt: new Date(),
        ...overrides,
    } as never);
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cookies).mockResolvedValue({ get: cookieGet } as never);
    withCookie("key1");
    withSession();
});

describe("hashSessionToken", () => {
    it("is the sha256 hex of the token", () => {
        expect(hashSessionToken("abc")).toBe(createHash("sha256").update("abc").digest("hex"));
    });
});

describe("getContractorSession", () => {
    it("returns null without a cookie, without querying", async () => {
        withCookie(undefined);
        expect(await getContractorSession()).toBeNull();
        expect(prisma.contractorSession.findUnique).not.toHaveBeenCalled();
    });

    it("looks the session up by the cookie's hash and returns null when unknown", async () => {
        vi.mocked(prisma.contractorSession.findUnique).mockResolvedValue(null);
        expect(await getContractorSession()).toBeNull();
        expect(prisma.contractorSession.findUnique).toHaveBeenCalledWith({
            where: { tokenHash: hashSessionToken("key1") },
        });
    });

    it("returns null for a revoked session", async () => {
        withSession({ revokedAt: new Date() });
        expect(await getContractorSession()).toBeNull();
    });

    it("returns null for an expired session", async () => {
        withSession({ expiresAt: new Date(Date.now() - 1000) });
        expect(await getContractorSession()).toBeNull();
    });

    it("returns the session without updating it when it was used today", async () => {
        expect(await getContractorSession()).toEqual({ id: "s1", email: "sam@example.com" });
        expect(prisma.contractorSession.update).not.toHaveBeenCalled();
    });

    it("extends a session last used 2 days ago to 30 days from now", async () => {
        withSession({ lastUsedAt: new Date(Date.now() - 2 * DAY_MS) });
        const before = Date.now();

        expect(await getContractorSession()).toEqual({ id: "s1", email: "sam@example.com" });

        const call = vi.mocked(prisma.contractorSession.update).mock.calls[0][0];
        expect(call.where).toEqual({ id: "s1" });
        const data = call.data as { lastUsedAt: Date; expiresAt: Date };
        expect(data.lastUsedAt.getTime()).toBeGreaterThanOrEqual(before);
        expect(data.expiresAt.getTime() - data.lastUsedAt.getTime()).toBe(30 * DAY_MS);
    });

    it("never throws", async () => {
        vi.mocked(prisma.contractorSession.findUnique).mockRejectedValue(new Error("database down"));
        vi.spyOn(console, "error").mockImplementation(() => {});
        expect(await getContractorSession()).toBeNull();
    });
});

describe("isVerifiedFor", () => {
    it("is true when the session's email matches ignoring case and spaces", async () => {
        expect(await isVerifiedFor({ contractorEmail: "  Sam@Example.com " })).toBe(true);
    });

    it("is false for another email", async () => {
        expect(await isVerifiedFor({ contractorEmail: "other@example.com" })).toBe(false);
    });

    it("is false without a contractor email, without reading the cookie", async () => {
        expect(await isVerifiedFor({ contractorEmail: null })).toBe(false);
        expect(cookies).not.toHaveBeenCalled();
    });

    it("is false without a session", async () => {
        withCookie(undefined);
        expect(await isVerifiedFor({ contractorEmail: "sam@example.com" })).toBe(false);
    });
});

describe("createContractorSession", () => {
    it("stores the token's hash, not the token, with a 30-day expiry", async () => {
        const before = Date.now();
        const { token, expiresAt } = await createContractorSession({
            email: " Sam@Example.com",
            remember: false,
            userAgent: "Chrome",
        });

        expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
        const data = vi.mocked(prisma.contractorSession.create).mock.calls[0][0].data;
        expect(data).toEqual({
            tokenHash: hashSessionToken(token),
            email: "sam@example.com",
            remember: false,
            userAgent: "Chrome",
            expiresAt,
        });
        expect(JSON.stringify(data)).not.toContain(token);
        expect(expiresAt.getTime() - before).toBeGreaterThanOrEqual(30 * DAY_MS);
        expect(expiresAt.getTime() - before).toBeLessThan(30 * DAY_MS + 5000);
    });
});

describe("sessionCookieOptions", () => {
    it("lasts a year when remembered and the browser session otherwise", () => {
        expect(sessionCookieOptions(true)).toMatchObject({
            httpOnly: true,
            sameSite: "lax",
            path: "/wo",
            maxAge: 365 * 24 * 60 * 60,
        });
        expect(sessionCookieOptions(false)).not.toHaveProperty("maxAge");
    });
});

describe("revokeContractorSessions", () => {
    it("revokes every unrevoked session for the normalized email", async () => {
        vi.mocked(prisma.contractorSession.updateMany).mockResolvedValue({ count: 2 } as never);

        expect(await revokeContractorSessions(" Sam@Example.com ")).toBe(2);
        expect(prisma.contractorSession.updateMany).toHaveBeenCalledWith({
            where: { email: "sam@example.com", revokedAt: null },
            data: { revokedAt: expect.any(Date) },
        });
    });
});

describe("countContractorSessions", () => {
    it("counts live sessions only", async () => {
        vi.mocked(prisma.contractorSession.count).mockResolvedValue(3);

        expect(await countContractorSessions("Sam@example.com")).toBe(3);
        expect(prisma.contractorSession.count).toHaveBeenCalledWith({
            where: { email: "sam@example.com", revokedAt: null, expiresAt: { gt: expect.any(Date) } },
        });
    });
});
