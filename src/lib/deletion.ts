// Server-only. Self-serve deletion from Settings: "Delete organization" (admins) and "Delete my account". Clerk is
// changed first, then Praedium's data. If the data step fails after Clerk's, the organization is locked
// (deletedAt) and the daily cleanup job finishes it, so a half-done delete never leaves data reachable.
import type { clerkClient } from "@clerk/nextjs/server";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import type { ActionResult } from "@/lib/actionResult";
import { anonymizeUser } from "@/lib/clerkWebhook";
import prisma from "@/lib/prisma";
import { purgeOrganization } from "@/lib/purgeOrganization";

type Clerk = Awaited<ReturnType<typeof clerkClient>>;

// Deletes the organization in Clerk (already gone counts as done), then its data in Praedium.
export async function deleteOrganizationEverywhere(clerk: Clerk, clerkOrgId: string): Promise<void> {
    try {
        await clerk.organizations.deleteOrganization(clerkOrgId);
    } catch (error) {
        if (!(isClerkAPIResponseError(error) && error.status === 404)) throw error;
    }

    const organization = await prisma.organization.findUnique({ where: { clerkOrgId }, select: { id: true } });
    if (!organization) return;
    try {
        await purgeOrganization(organization.id);
    } catch (error) {
        console.error(`Purging organization ${organization.id} failed; the cleanup job will retry`, error);
        // Dated far in the past so the next cleanup run purges it, instead of waiting out the 30 days.
        await prisma.organization.updateMany({ where: { id: organization.id }, data: { deletedAt: new Date(0) } });
    }
}

export type AccountDeletionPlan = {
    // Organizations where this user is the only admin but not the only member: deleting would leave no admin.
    blockedBy: string[];
    // Organizations where this user is the only member: deleted along with the account.
    organizationsToDelete: { clerkOrgId: string; name: string }[];
};

const PAGE = { limit: 100 };

// What deleting this user's account would do, from Clerk's own memberships.
export async function planAccountDeletion(clerk: Clerk, clerkUserId: string): Promise<AccountDeletionPlan> {
    const plan: AccountDeletionPlan = { blockedBy: [], organizationsToDelete: [] };
    const memberships = await clerk.users.getOrganizationMembershipList({ userId: clerkUserId, ...PAGE });
    for (const membership of memberships.data) {
        const { id, name } = membership.organization;
        const members = await clerk.organizations.getOrganizationMembershipList({ organizationId: id, ...PAGE });
        const others = members.data.filter((member) => member.publicUserData?.userId !== clerkUserId);
        if (others.length === 0) {
            plan.organizationsToDelete.push({ clerkOrgId: id, name });
        } else if (membership.role === "org:admin" && !others.some((member) => member.role === "org:admin")) {
            plan.blockedBy.push(name);
        }
    }
    return plan;
}

export function blockedMessage(names: string[]): string {
    const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
    return `You're the only admin of ${list}. Make someone else an admin first, then delete your account.`;
}

// Deletes the organizations only this user belongs to, then the user in Clerk, then clears their name and email
// in Praedium (the user.deleted webhook does the same when it arrives).
export async function deleteAccount(clerk: Clerk, clerkUserId: string): Promise<ActionResult> {
    const plan = await planAccountDeletion(clerk, clerkUserId);
    if (plan.blockedBy.length > 0) return { ok: false, error: blockedMessage(plan.blockedBy) };

    for (const organization of plan.organizationsToDelete) {
        await deleteOrganizationEverywhere(clerk, organization.clerkOrgId);
    }
    await clerk.users.deleteUser(clerkUserId);

    // The row may already be gone with an organization above (the deprecated User.organizationId cascade).
    const user = await prisma.user.findUnique({ where: { clerkId: clerkUserId }, select: { id: true } });
    if (user) await anonymizeUser(user.id);
    return { ok: true };
}
