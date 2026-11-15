import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
    default: { $queryRaw: vi.fn(), $executeRaw: vi.fn() },
}));

import prisma from "@/lib/prisma";
import { clientIp, peekRateLimit, rateLimit } from "./rateLimit";

const rule = { limit: 3, windowSeconds: 60 };

function counted(count: number, resetInMs = 30_000) {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ count, resetAt: new Date(Date.now() + resetInMs) }] as never);
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.$executeRaw).mockResolvedValue(0 as never);
});

describe("rateLimit", () => {
    it("allows a request under the limit and reports what's left", async () => {
        counted(2);
        expect(await rateLimit("test:a", rule)).toEqual({ ok: true, remaining: 1, retryAfterSeconds: 0 });
    });

    it("still allows the request that reaches the limit exactly", async () => {
        counted(3);
        expect(await rateLimit("test:a", rule)).toEqual({ ok: true, remaining: 0, retryAfterSeconds: 0 });
    });

    it("refuses the request over the limit, with a retry time from resetAt", async () => {
        counted(4, 12_500);
        const result = await rateLimit("test:a", rule);
        expect(result.ok).toBe(false);
        expect(result.remaining).toBe(0);
        expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(1);
        expect(result.retryAfterSeconds).toBeLessThanOrEqual(13);
    });

    it("waits at least a second even when the window is about to end", async () => {
        counted(4, 0);
        expect((await rateLimit("test:a", rule)).retryAfterSeconds).toBe(1);
    });

    it("cleans up expired rows only when a window starts", async () => {
        counted(1);
        await rateLimit("test:a", rule);
        expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);

        vi.mocked(prisma.$executeRaw).mockClear();
        counted(2);
        await rateLimit("test:a", rule);
        expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });

    it("fails open and logs when the database errors", async () => {
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
        vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error("connection lost"));
        expect(await rateLimit("test:a", rule)).toEqual({ ok: true, remaining: 3, retryAfterSeconds: 0 });
        expect(consoleError).toHaveBeenCalledWith("rateLimit failed", expect.any(Error));
        consoleError.mockRestore();
    });
});

describe("peekRateLimit", () => {
    it("reads the bucket's count without writing", async () => {
        counted(7);
        expect(await peekRateLimit("test:a")).toBe(7);
        expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });

    it("reads 0 when the bucket's window has ended", async () => {
        counted(7, -1000);
        expect(await peekRateLimit("test:a")).toBe(0);
    });

    it("reads 0 when there's no bucket yet", async () => {
        vi.mocked(prisma.$queryRaw).mockResolvedValue([] as never);
        expect(await peekRateLimit("test:a")).toBe(0);
    });

    it("fails open (reads 0) and logs when the database errors", async () => {
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
        vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error("connection lost"));
        expect(await peekRateLimit("test:a")).toBe(0);
        expect(consoleError).toHaveBeenCalledWith("peekRateLimit failed", expect.any(Error));
        consoleError.mockRestore();
    });
});

describe("clientIp", () => {
    it("uses the first x-forwarded-for entry, trimmed", () => {
        expect(clientIp(new Headers({ "x-forwarded-for": " 203.0.113.7 , 10.0.0.1", "x-real-ip": "10.0.0.2" }))).toBe(
            "203.0.113.7",
        );
    });

    it("falls back to x-real-ip", () => {
        expect(clientIp(new Headers({ "x-real-ip": "198.51.100.4" }))).toBe("198.51.100.4");
    });

    it("returns unknown without either header", () => {
        expect(clientIp(new Headers())).toBe("unknown");
    });
});
