// Server-only. Self-serve deletion from Settings.
// - "Delete organization" (admins) only locks the organization (deletedAt): no one can open it, its API keys and
//   contractor links stop working, and every admin is emailed. Any admin can restore it from /setup for 7 days
//   (KEEP_DAYS.deletedOrganization in cleanup.ts); after that the daily cleanup job deletes it in Clerk, then purges
//   its data.
// - "Delete my account" is immediate, including organizations the user is the only member of: Clerk is changed
//   first, then Praedium's data. If the data step fails after Clerk's, the organization is locked and dated in the
//   past, so the cleanup job finishes it and a half-done delete never leaves data reachable.
import type { clerkClient } from "@clerk/nextjs/server";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import type { ActionResult } from "@/lib/actionResult";
import { anonymizeUser } from "@/lib/clerkWebhook";
import { getAppUrl } from "@/lib/email";
import { sendLoggedEmail } from "@/lib/emailLog";
import { organizationDeletedEmail } from "@/lib/emails/organizationDeletedEmail";
import prisma from "@/lib/prisma";
import { purgeOrganization } from "@/lib/purgeOrganization";

type Clerk = Awaited<ReturnType<typeof clerkClient>>;

const PAGE = { limit: 100 };

// Every item of a paginated Clerk list, a page at a time.
export async function allPages<T>(
    fetchPage: (page: { limit: number; offset: number }) => Promise<{ data: T[]; totalCount: number }>,
): Promise<T[]> {
    const items: T[] = [];
    for (;;) {
        const page = await fetchPage({ ...PAGE, offset: items.length });
        items.push(...page.data);
        if (page.data.length < PAGE.limit || items.length >= page.totalCount) return items;
    }
}

// Deletes the organization in Clerk; already gone counts as done.
export async function deleteClerkOrganization(clerk: Clerk, clerkOrgId: string): Promise<void> {
    try {
        await clerk.organizations.deleteOrganization(clerkOrgId);
    } catch (error) {
        if (!(isClerkAPIResponseError(error) && error.status === 404)) throw error;
    }
}

// Deletes the organization in Clerk, then its data in Praedium. Used by "Delete my account".
export async function deleteOrganizationEverywhere(clerk: Clerk, clerkOrgId: string): Promise<void> {
    await deleteClerkOrganization(clerk, clerkOrgId);

    const organization = await prisma.organization.findUnique({ where: { clerkOrgId }, select: { id: true } });
    if (!organization) return;
    try {
        await purgeOrganization(organization.id);
    } catch (error) {
        console.error(`Purging organization ${organization.id} failed; the cleanup job will retry`, error);
        // Dated far in the past so the next cleanup run purges it, instead of waiting out the restore window.
        await prisma.organization.updateMany({ where: { id: organization.id }, data: { deletedAt: new Date(0) } });
    }
}

// Locks the organization for deletion at `now`. True when this call locked it; false when it already was locked.
export async function lockOrganization(organizationId: string, now: Date): Promise<boolean> {
    const { count } = await prisma.organization.updateMany({
        where: { id: organizationId, deletedAt: null },
        data: { deletedAt: now },
    });
    return count > 0;
}

// Emails every admin of the organization (from Clerk, including the one who deleted it) that it was locked and when
// it will be deleted. One failed email doesn't stop the others; none of them throws.
export async function notifyOrganizationDeleted(
    clerk: Clerk,
    input: {
        organization: { id: string; clerkOrgId: string; name: string };
        deletedBy: string;
        deletedAt: Date;
        restoreDeadline: Date;
    },
): Promise<void> {
    const { organization } = input;
    const admins = await allPages((page) =>
        clerk.organizations.getOrganizationMembershipList({
            organizationId: organization.clerkOrgId,
            role: ["org:admin"],
            ...page,
        }),
    );
    const email = organizationDeletedEmail({
        organizationName: organization.name,
        deletedBy: input.deletedBy,
        deletedAt: input.deletedAt,
        restoreDeadline: input.restoreDeadline,
        setupUrl: `${getAppUrl()}/setup`,
    });

    for (const admin of admins) {
        const userId = admin.publicUserData?.userId;
        if (!userId || admin.role !== "org:admin") continue;
        try {
            const user = await clerk.users.getUser(userId);
            const to = user.primaryEmailAddress?.emailAddress;
            if (!to) continue;
            await sendLoggedEmail({ organizationId: organization.id, kind: "ORGANIZATION_DELETED", to, ...email });
        } catch (error) {
            console.error(`Deletion notice for organization ${organization.id} to user ${userId} failed`, error);
        }
    }
}

export type AccountDeletionPlan = {
    // Organizations where this user is the only admin but not the only member: deleting would leave no admin.
    blockedBy: string[];
    // Organizations where this user is the only member: deleted along with the account.
    organizationsToDelete: { clerkOrgId: string; name: string }[];
};

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
