// Clerk decides who belongs to an organization and who is an admin (org:admin). Each request reads the role
// from Clerk; the Membership row mirrors it so the database knows the members of each organization.
import { auth, currentUser, clerkClient } from "@clerk/nextjs/server";
import { Prisma, type User, type Organization } from "@/generated/prisma/client";
import type { UserRole } from "@/generated/prisma/enums";
import prisma from "./prisma";

type AuthResult =
    | { state: "signed-out" }
    | { state: "needs-org"; clerkUserId: string }
    | { state: "ready"; user: User; organization: Organization; role: UserRole };

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
        const clerkOrg = await client.organizations.getOrganization({ organizationId: orgId });
        try {
            organization = await prisma.organization.create({
                data: { clerkOrgId: orgId, name: clerkOrg.name },
            });
        } catch (error) {
            if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
            organization = await prisma.organization.findUniqueOrThrow({ where: { clerkOrgId: orgId } });
        }
    }

    let user = await prisma.user.findUnique({
        where: { clerkId: userId },
    });

    if (!user) {
        const clerkUser = await currentUser();
        const email = clerkUser?.emailAddresses[0]?.emailAddress;
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
