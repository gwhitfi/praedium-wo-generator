// Clerk decides who belongs to an organization and who is an admin (org:admin). Each request reads the role
// from Clerk; the Membership row mirrors it so the database knows the members of each organization.
import { auth, currentUser, clerkClient } from "@clerk/nextjs/server";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { Prisma, type User, type Organization } from "@/generated/prisma/client";
import type { UserRole } from "@/generated/prisma/enums";
import prisma from "./prisma";

type AuthResult =
    | { state: "signed-out" }
    | { state: "needs-org"; clerkUserId: string }
    | { state: "ready"; user: User; organization: Organization; role: UserRole };

type ClerkUser = NonNullable<Awaited<ReturnType<typeof currentUser>>>;

// How often a user's name and email are re-read from Clerk. The local copy names them in the Activity log and on
// API keys; checking once a day costs one Clerk call per user per day.
const PROFILE_REFRESH_MS = 24 * 60 * 60 * 1000;

// Clerk's answer for something that doesn't exist (any more).
function isNotFound(error: unknown): boolean {
    return isClerkAPIResponseError(error) && error.status === 404;
}

// The primary address, falling back to the first one when Clerk has none marked primary.
function clerkEmail(clerkUser: ClerkUser): string | undefined {
    return clerkUser.primaryEmailAddress?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress;
}

// Copies a changed name or primary email from Clerk. The write also moves `updatedAt`, which starts the next day's
// wait, so it happens even when nothing changed. A Clerk failure keeps the old copy instead of failing the request.
async function refreshProfile(user: User): Promise<User> {
    if (Date.now() - user.updatedAt.getTime() < PROFILE_REFRESH_MS) return user;
    try {
        const clerkUser = await currentUser();
        if (!clerkUser) return user;
        return await prisma.user.update({
            where: { id: user.id },
            data: {
                email: clerkEmail(clerkUser) ?? user.email,
                firstName: clerkUser.firstName ?? null,
                lastName: clerkUser.lastName ?? null,
            },
        });
    } catch (error) {
        console.error("refreshProfile failed", error);
        return user;
    }
}

export async function getCurrentUser(): Promise<AuthResult> {
    const { userId, orgId, orgRole } = await auth();
    if (!userId) {
        return { state: "signed-out" };
    }
    if (!orgId) {
        return { state: "needs-org", clerkUserId: userId };
    }
    const role: UserRole = orgRole === "org:admin" ? "ADMIN" : "USER";

    let organization = await prisma.organization.findUnique({
        where: { clerkOrgId: orgId },
    });
    if (!organization) {
        const client = await clerkClient();
        let clerkOrg: Awaited<ReturnType<typeof client.organizations.getOrganization>>;
        try {
            clerkOrg = await client.organizations.getOrganization({ organizationId: orgId });
        } catch (error) {
            // The session still names an organization that was just deleted (its token lives up to a minute after
            // the delete): treat it as no organization rather than failing the page.
            if (isNotFound(error)) return { state: "needs-org", clerkUserId: userId };
            throw error;
        }
        try {
            organization = await prisma.organization.create({
                data: { clerkOrgId: orgId, name: clerkOrg.name },
            });
        } catch (error) {
            if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
            organization = await prisma.organization.findUniqueOrThrow({ where: { clerkOrgId: orgId } });
        }
    }
    // Deleted in Clerk (webhook): locked until it's purged. The user picks or creates another one at /setup.
    if (organization.deletedAt) {
        return { state: "needs-org", clerkUserId: userId };
    }

    let user = await prisma.user.findUnique({
        where: { clerkId: userId },
    });

    if (!user) {
        let clerkUser: ClerkUser | null;
        try {
            clerkUser = await currentUser();
        } catch (error) {
            // Likewise for a user deleted moments ago: their session is over.
            if (isNotFound(error)) return { state: "signed-out" };
            throw error;
        }
        if (!clerkUser) return { state: "signed-out" };
        const email = clerkEmail(clerkUser);
        if (!email) {
            throw new Error("Clerk user has no email address");
        }

        try {
            user = await prisma.user.create({
                data: {
                    clerkId: userId,
                    email,
                    firstName: clerkUser?.firstName ?? null,
                    lastName: clerkUser?.lastName ?? null,
                    organizationId: organization.id,
                },
            });
        } catch (error) {
            if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
            user = await prisma.user.findUniqueOrThrow({ where: { clerkId: userId } });
        }
    } else {
        user = await refreshProfile(user);
    }

    const membership = await prisma.membership.findUnique({
        where: { userId_organizationId: { userId: user.id, organizationId: organization.id } },
    });
    if (!membership) {
        try {
            await prisma.membership.create({
                data: { userId: user.id, organizationId: organization.id, role },
            });
        } catch (error) {
            if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
        }
    } else if (membership.role !== role) {
        await prisma.membership.update({ where: { id: membership.id }, data: { role } });
    }

    return { state: "ready", user, organization, role };
}
