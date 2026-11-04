import { createHash, randomBytes } from "node:crypto";
import { after } from "next/server";
import type { Organization, User } from "@/generated/prisma/client";
import prisma from "./prisma";

const KEY_PREFIX = "pr_";
// 32 random bytes in base64url is 43 characters.
const KEY_PATTERN = /^pr_[A-Za-z0-9_-]{43}$/;

export type GeneratedApiKey = { key: string; prefix: string; keyHash: string };

export function hashApiKey(key: string): string {
    return createHash("sha256").update(key).digest("hex");
}

// The full key is shown to the user once; only `keyHash` and `prefix` are stored.
export function generateApiKey(): GeneratedApiKey {
    const secret = randomBytes(32).toString("base64url");
    const key = KEY_PREFIX + secret;
    return { key, prefix: secret.slice(0, 8), keyHash: hashApiKey(key) };
}

// `user` is the key's creator, or null if that user has since been deleted. `canChangeStatus` lets the key send,
// cancel, archive and restore work orders.
export type VerifiedApiKey = { organization: Organization; user: User | null; canChangeStatus: boolean };

// Runs a task after the response is sent: Next's after() by default; tests pass their own.
export type ScheduleTask = (task: () => Promise<void>) => void;

export async function verifyApiKey(bearer: string, schedule: ScheduleTask = after): Promise<VerifiedApiKey | null> {
    if (!KEY_PATTERN.test(bearer)) return null;

    const apiKey = await prisma.apiKey.findFirst({
        where: { keyHash: hashApiKey(bearer), revokedAt: null },
        include: { organization: true, createdBy: true },
    });
    if (!apiKey) return null;

    // After the response, so it doesn't slow the request but isn't cut off on Vercel. Failures are only logged.
    const usedAt = new Date();
    schedule(async () => {
        try {
            await prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: usedAt } });
        } catch (error) {
            console.error("Failed to update API key lastUsedAt", error);
        }
    });

    return { organization: apiKey.organization, user: apiKey.createdBy, canChangeStatus: apiKey.canChangeStatus };
}
