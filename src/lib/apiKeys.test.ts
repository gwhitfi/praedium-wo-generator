import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
    default: {
        apiKey: { findFirst: vi.fn(), update: vi.fn() },
    },
}));

vi.mock("next/server", () => ({ after: vi.fn() }));

import { after } from "next/server";
import prisma from "@/lib/prisma";
import { generateApiKey, hashApiKey, verifyApiKey } from "./apiKeys";

// Runs the task verifyApiKey last passed to after().
async function runAfterTask(): Promise<void> {
    const task = vi.mocked(after).mock.lastCall?.[0];
    if (typeof task !== "function") throw new Error("after() was not called with a task");
    await task();
}

const organization = { id: "org1", name: "Acme" };
const user = { id: "user1", firstName: "Justin" };

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.apiKey.update).mockResolvedValue({} as never);
});

describe("generateApiKey", () => {
    it("returns a pr_ key, its prefix and its sha256 hash", () => {
        const { key, prefix, keyHash } = generateApiKey();
        expect(key).toMatch(/^pr_[A-Za-z0-9_-]{43}$/);
        expect(prefix).toBe(key.slice(3, 11));
        expect(keyHash).toMatch(/^[0-9a-f]{64}$/);
        expect(keyHash).toBe(hashApiKey(key));
    });

    it("returns a different key each time", () => {
        expect(generateApiKey().key).not.toBe(generateApiKey().key);
    });
});

describe("verifyApiKey", () => {
    it("looks the key up by hash among unrevoked keys and returns its organization and creator", async () => {
        const { key, keyHash } = generateApiKey();
        vi.mocked(prisma.apiKey.findFirst).mockResolvedValue({
            id: "key1",
            organization,
            createdBy: user,
            canChangeStatus: false,
        } as never);

        await expect(verifyApiKey(key)).resolves.toEqual({ organization, user, canChangeStatus: false });
        expect(prisma.apiKey.findFirst).toHaveBeenCalledWith({
            where: { keyHash, revokedAt: null },
            include: { organization: true, createdBy: true },
        });
        expect(prisma.apiKey.update).not.toHaveBeenCalled();
        await runAfterTask();
        expect(prisma.apiKey.update).toHaveBeenCalledWith({
            where: { id: "key1" },
            data: { lastUsedAt: expect.any(Date) },
        });
    });

    it("returns null for an unknown or revoked key", async () => {
        vi.mocked(prisma.apiKey.findFirst).mockResolvedValue(null);
        await expect(verifyApiKey(generateApiKey().key)).resolves.toBeNull();
        expect(prisma.apiKey.update).not.toHaveBeenCalled();
    });

    it("rejects malformed keys without querying", async () => {
        for (const bad of ["", "pr_short", "sk_" + "a".repeat(43), generateApiKey().key + "x"]) {
            await expect(verifyApiKey(bad)).resolves.toBeNull();
        }
        expect(prisma.apiKey.findFirst).not.toHaveBeenCalled();
    });

    it("returns a null user when the key's creator was deleted", async () => {
        vi.mocked(prisma.apiKey.findFirst).mockResolvedValue({ id: "key1", organization, createdBy: null } as never);
        await expect(verifyApiKey(generateApiKey().key)).resolves.toEqual({ organization, user: null });
    });

    it("passes on the key's status permission", async () => {
        vi.mocked(prisma.apiKey.findFirst).mockResolvedValue({
            id: "key1",
            organization,
            createdBy: user,
            canChangeStatus: true,
        } as never);
        await expect(verifyApiKey(generateApiKey().key)).resolves.toEqual({
            organization,
            user,
            canChangeStatus: true,
        });
    });

    it("logs, never throws, when the lastUsedAt update fails after the response", async () => {
        const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
        vi.mocked(prisma.apiKey.findFirst).mockResolvedValue({ id: "key1", organization, createdBy: user } as never);
        vi.mocked(prisma.apiKey.update).mockRejectedValue(new Error("db down"));

        await expect(verifyApiKey(generateApiKey().key)).resolves.toEqual({ organization, user });
        await expect(runAfterTask()).resolves.toBeUndefined();
        expect(errorLog).toHaveBeenCalledWith("Failed to update API key lastUsedAt", expect.any(Error));
        errorLog.mockRestore();
    });

    it("hands the lastUsedAt update to an injected scheduler instead of after()", async () => {
        vi.mocked(prisma.apiKey.findFirst).mockResolvedValue({ id: "key1", organization, createdBy: user } as never);
        vi.mocked(prisma.apiKey.update).mockReturnValue(new Promise(() => {}) as never);
        const schedule = vi.fn((task: () => Promise<void>) => void task());

        // A hanging update doesn't hold up the result.
        await expect(verifyApiKey(generateApiKey().key, schedule)).resolves.toEqual({ organization, user });
        expect(schedule).toHaveBeenCalledOnce();
        expect(after).not.toHaveBeenCalled();
        expect(prisma.apiKey.update).toHaveBeenCalledWith({
            where: { id: "key1" },
            data: { lastUsedAt: expect.any(Date) },
        });
    });
});
