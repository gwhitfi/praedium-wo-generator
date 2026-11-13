import type { Metadata } from "next";
import { OrganizationList } from "@clerk/nextjs";
import { auth, clerkClient } from "@clerk/nextjs/server";
import Logo from "@/components/Logo";
import { restoreCutoff, restoreDeadline } from "@/lib/cleanup";
import { dateInAppTimeZone, formatFullDate } from "@/lib/dates";
import { allPages } from "@/lib/deletion";
import prisma from "@/lib/prisma";
import { noticeClass } from "@/lib/ui";
import { RestoreOrganizationButton } from "./RestoreOrganizationButton";

export const metadata: Metadata = { title: "Choose your organization" };

type ScheduledOrganization = { clerkOrgId: string; name: string; deletesOn: string; isAdmin: boolean };

// The signed-in user's organizations that an admin deleted in Settings and that can still be restored. Empty when
// signed out, or when Clerk can't be reached (the rest of the page still works).
async function scheduledForDeletion(): Promise<ScheduledOrganization[]> {
    const { userId } = await auth();
    if (!userId) return [];
    try {
        const clerk = await clerkClient();
        const memberships = await allPages((page) =>
            clerk.users.getOrganizationMembershipList({ userId, ...page }),
        );
        if (memberships.length === 0) return [];
        const roles = new Map(memberships.map((membership) => [membership.organization.id, membership.role]));

        const organizations = await prisma.organization.findMany({
            where: { clerkOrgId: { in: [...roles.keys()] }, deletedAt: { not: null, gt: restoreCutoff(new Date()) } },
            select: { clerkOrgId: true, name: true, deletedAt: true },
            orderBy: { deletedAt: "asc" },
        });
        return organizations.map((organization) => ({
            clerkOrgId: organization.clerkOrgId,
            name: organization.name,
            deletesOn: formatFullDate(dateInAppTimeZone(restoreDeadline(organization.deletedAt ?? new Date()))),
            isAdmin: roles.get(organization.clerkOrgId) === "org:admin",
        }));
    } catch (error) {
        console.error("Couldn't look up organizations scheduled for deletion", error);
        return [];
    }
}

// Shown when the signed-in user has no active organization: after sign-up, after leaving one, and after one was
// deleted. Lists organizations scheduled for deletion first (admins can restore them), then the organizations they
// still belong to (and pending invitations) with a create option. No personal accounts: the app needs an
// organization.
export default async function Page(): Promise<React.ReactElement> {
    const scheduled = await scheduledForDeletion();
    return (
        <main id="main" className="flex min-h-screen flex-col items-center px-4 py-10 text-foreground">
            <Logo className="h-7 w-auto" />
            <div className="flex w-full flex-1 flex-col items-center justify-center gap-4 py-10 text-center">
                <div className="max-w-md">
                    <h1 className="text-2xl font-semibold tracking-tight">Set up your organization</h1>
                    <p className="mt-2 text-sm text-muted">
                        Your properties, contacts and work orders belong to an organization, usually your company.
                        Create one, or join one you&apos;ve been invited to.
                    </p>
                </div>
                {scheduled.map((organization) => (
                    <div
                        key={organization.clerkOrgId}
                        className={`${noticeClass.warning} flex w-full max-w-md flex-col gap-3 text-left`}
                    >
                        <div>
                            <p className="font-semibold">{organization.name}</p>
                            <p className="text-secondary">Scheduled for deletion on {organization.deletesOn}.</p>
                        </div>
                        {organization.isAdmin ? (
                            <RestoreOrganizationButton clerkOrgId={organization.clerkOrgId} name={organization.name} />
                        ) : (
                            <p className="text-muted">Ask an admin to restore it.</p>
                        )}
                    </div>
                ))}
                <OrganizationList hidePersonal afterSelectOrganizationUrl="/" afterCreateOrganizationUrl="/" />
            </div>
        </main>
    );
}
