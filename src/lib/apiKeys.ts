import { createHash, randomBytes } from "node:crypto";
import { after } from "next/server";
import type { Organization, User } from "@/generated/prisma/client";
import prisma from "./prisma";

const KEY_PREFIX = "pr_";
// 32 random bytes in base64url is 43 characters.
const KEY_PATTERN = /^pr_[A-Za-z0-9_-]{43}$/;

export type GeneratedApiKey = { key: string; prefix: string; keyHash: string };

// True when a token has the shape of a Praedium key. The handler uses it only to say why a request was refused.
export function looksLikeApiKey(token: string): boolean {
    return KEY_PATTERN.test(token);
}

export function hashApiKey(key: string): string {
    return createHash("sha256").update(key).digest("hex");
}

// The full key is shown to the user once; only `keyHash` and `prefix` are stored.
export function generateApiKey(): GeneratedApiKey {
    const secret = randomBytes(32).toString("base64url");
    const key = KEY_PREFIX + secret;
    return { key, prefix: secret.slice(0, 8), keyHash: hashApiKey(key) };
}

// `user` is the key's creator. verifyApiKey() no longer accepts a key whose creator was deleted or left, so it's
// always set; the type stays nullable for the MCP tools' existing checks. `canChangeStatus` lets the key send,
// cancel, archive and restore work orders.
export type VerifiedApiKey = { organization: Organization; user: User | null; canChangeStatus: boolean };

// Runs a task after the response is sent: Next's after() by default; tests pass their own.
export type ScheduleTask = (task: () => Promise<void>) => void;

export async function verifyApiKey(bearer: string, schedule: ScheduleTask = after): Promise<VerifiedApiKey | null> {
    if (!looksLikeApiKey(bearer)) return null;

    const apiKey = await prisma.apiKey.findFirst({
        where: { keyHash: hashApiKey(bearer), revokedAt: null, organization: { deletedAt: null } },
        include: {
            organization: true,
            createdBy: { include: { memberships: { select: { organizationId: true } } } },
        },
    });
    if (!apiKey) return null;
    // A key works only while its creator still belongs to the organization. The Clerk webhook revokes the keys
    // when someone leaves (src/lib/clerkWebhook.ts); this holds even if that webhook was missed.
    const creator = apiKey.createdBy;
    if (!creator || !creator.memberships.some((m) => m.organizationId === apiKey.organizationId)) return null;

    // After the response, so it doesn't slow the request but isn't cut off on Vercel. Failures are only logged.
    const usedAt = new Date();
    schedule(async () => {
        try {
            await prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: usedAt } });
        } catch (error) {
            console.error("Failed to update API key lastUsedAt", error);
        }
    });

    // The creator without the memberships loaded for the check above.
    const user: User = { ...creator };
    delete (user as Partial<typeof creator>).memberships;
    return { organization: apiKey.organization, user, canChangeStatus: apiKey.canChangeStatus };
}
