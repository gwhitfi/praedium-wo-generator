"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { z } from "zod";
import type { ActionResult } from "@/lib/actionResult";
import { restoreCutoff } from "@/lib/cleanup";
import prisma from "@/lib/prisma";

const clerkOrgIdInput = z.string().regex(/^org_[A-Za-z0-9]{1,64}$/);

const NOT_FOUND: ActionResult = { ok: false, error: "This organization wasn't found." };

// Restores an organization an admin deleted in Settings, while it's still inside the restore window. The caller must
// be an admin of it in Clerk, checked here on every call.
export async function restoreOrganization(clerkOrgId: string): Promise<ActionResult> {
    const input = clerkOrgIdInput.safeParse(clerkOrgId);
    if (!input.success) return NOT_FOUND;

    const { userId } = await auth();
    if (!userId) return { ok: false, error: "Sign in to restore an organization." };

    try {
        const clerk = await clerkClient();
        let role: string | undefined;
        try {
            const memberships = await clerk.organizations.getOrganizationMembershipList({
                organizationId: input.data,
                userId: [userId],
                limit: 1,
            });
            role = memberships.data.find((membership) => membership.publicUserData?.userId === userId)?.role;
        } catch (error) {
            // Gone from Clerk (deleted there, or never existed): nothing to restore.
            if (isClerkAPIResponseError(error) && error.status === 404) return NOT_FOUND;
            throw error;
        }
        if (!role) return NOT_FOUND;
        if (role !== "org:admin") return { ok: false, error: "Only an admin can restore the organization." };

        const { count } = await prisma.organization.updateMany({
            where: { clerkOrgId: input.data, deletedAt: { not: null, gt: restoreCutoff(new Date()) } },
            data: { deletedAt: null },
        });
        if (count === 0) {
            const organization = await prisma.organization.findUnique({
                where: { clerkOrgId: input.data },
                select: { id: true, deletedAt: true },
            });
            if (!organization) return NOT_FOUND;
            // Another admin restored it first.
            if (!organization.deletedAt) return { ok: true };
            return { ok: false, error: "This organization can't be restored any more." };
        }

        console.info(`Organization ${input.data} restored by Clerk user ${userId}`);
        return { ok: true };
    } catch (error) {
        console.error("restoreOrganization failed", error);
        return { ok: false, error: "Couldn't restore the organization. Try again." };
    }
}
