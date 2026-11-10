// Server-only. Keeps Praedium in step with Clerk (webhooks, verified in src/app/api/webhooks/clerk/route.ts) so
// that leaving or being deleted takes effect at once: a removed member's API keys stop working, a deleted
// organization is locked, a deleted user's name and email are cleared. Each handler is safe to receive twice.
import type { WebhookEvent } from "@clerk/nextjs/webhooks";
import prisma from "@/lib/prisma";

// Shown in Settings next to a key Praedium revoked.
export const REVOKED_REASONS = {
    creatorLeft: "Its creator left the organization.",
    creatorDeleted: "Its creator's account was deleted.",
    organizationDeleted: "The organization was deleted.",
} as const;

// What's left of a deleted user's row: their events and keys still point at it, but nothing identifies them.
export function anonymizedEmail(userId: string): string {
    return `deleted-${userId}@users.invalid`;
}

export async function handleClerkEvent(event: WebhookEvent): Promise<void> {
    switch (event.type) {
        case "organizationMembership.deleted": {
            const [organization, user] = await Promise.all([
                prisma.organization.findUnique({ where: { clerkOrgId: event.data.organization.id } }),
                prisma.user.findUnique({ where: { clerkId: event.data.public_user_data.user_id } }),
            ]);
            if (!organization || !user) return;
            await prisma.$transaction([
                prisma.membership.deleteMany({ where: { userId: user.id, organizationId: organization.id } }),
                prisma.apiKey.updateMany({
                    where: { createdById: user.id, organizationId: organization.id, revokedAt: null },
                    data: { revokedAt: new Date(), revokedReason: REVOKED_REASONS.creatorLeft },
                }),
            ]);
            return;
        }

        case "organizationMembership.updated": {
            const [organization, user] = await Promise.all([
                prisma.organization.findUnique({ where: { clerkOrgId: event.data.organization.id } }),
                prisma.user.findUnique({ where: { clerkId: event.data.public_user_data.user_id } }),
            ]);
            if (!organization || !user) return;
            await prisma.membership.updateMany({
                where: { userId: user.id, organizationId: organization.id },
                data: { role: event.data.role === "org:admin" ? "ADMIN" : "USER" },
            });
            return;
        }

        case "organization.updated": {
            const name = event.data.name?.trim();
            if (!name) return;
            await prisma.organization.updateMany({ where: { clerkOrgId: event.data.id }, data: { name } });
            return;
        }

        case "organization.deleted": {
            const clerkOrgId = event.data.id;
            if (!clerkOrgId) return;
            const now = new Date();
            await prisma.$transaction([
                prisma.organization.updateMany({ where: { clerkOrgId, deletedAt: null }, data: { deletedAt: now } }),
                prisma.apiKey.updateMany({
                    where: { organization: { clerkOrgId }, revokedAt: null },
                    data: { revokedAt: now, revokedReason: REVOKED_REASONS.organizationDeleted },
                }),
            ]);
            return;
        }

        case "user.updated": {
            const data = event.data;
            const primary = data.email_addresses.find((address) => address.id === data.primary_email_address_id);
            const email = primary?.email_address.trim();
            await prisma.user.updateMany({
                where: { clerkId: data.id },
                data: { firstName: data.first_name, lastName: data.last_name, ...(email ? { email } : {}) },
            });
            return;
        }

        case "user.deleted": {
            if (!event.data.id) return;
            const user = await prisma.user.findUnique({ where: { clerkId: event.data.id } });
            if (!user) return;
            await prisma.$transaction([
                prisma.apiKey.updateMany({
                    where: { createdById: user.id, revokedAt: null },
                    data: { revokedAt: new Date(), revokedReason: REVOKED_REASONS.creatorDeleted },
                }),
                prisma.membership.deleteMany({ where: { userId: user.id } }),
                prisma.user.update({
                    where: { id: user.id },
                    data: { firstName: null, lastName: null, email: anonymizedEmail(user.id) },
                }),
            ]);
            return;
        }

        default:
            return;
    }
}
