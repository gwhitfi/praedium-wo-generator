// Server-only. Removes an organization and everything it owns: the "Delete organization" button (Settings) and the
// daily cleanup job (organizations deleted in Clerk over 30 days ago) both use it. Rows go in one transaction;
// stored photos are deleted after it succeeds, as for every other delete.
import { attachmentKeys } from "@/lib/attachments";
import prisma from "@/lib/prisma";
import { deleteFiles } from "@/lib/storage";

// Blob deletes are sent in batches of this many keys.
const FILE_BATCH = 500;

export type PurgeResult = { workOrders: number; files: number };

export async function purgeOrganization(organizationId: string): Promise<PurgeResult> {
    const keys = await attachmentKeys(organizationId, {});

    const workOrders = await prisma.$transaction(
        async (tx) => {
            // The deprecated User.organizationId still cascades: a user who first joined through this organization
            // would be deleted with it, even if they belong to others. Point them at another of theirs first. (Users
            // whose only organization this is do go; their Clerk account remains, and the row is made again if they
            // sign in.)
            const users = await tx.user.findMany({
                where: { organizationId },
                select: {
                    id: true,
                    memberships: {
                        where: { organizationId: { not: organizationId } },
                        select: { organizationId: true },
                        take: 1,
                    },
                },
            });
            for (const user of users) {
                const other = user.memberships[0]?.organizationId;
                if (other) await tx.user.update({ where: { id: user.id }, data: { organizationId: other } });
            }

            // Work orders first: a property can't be deleted while a work order points at it, and cascade order
            // within one statement isn't guaranteed. Their areas, line items, photos and history cascade.
            const deleted = await tx.workOrder.deleteMany({ where: { organizationId } });
            // Everything else cascades from the organization: properties, units, contacts, email log, API keys,
            // memberships.
            await tx.organization.delete({ where: { id: organizationId } });
            return deleted.count;
        },
        { timeout: 60_000 },
    );

    for (let i = 0; i < keys.length; i += FILE_BATCH) {
        await deleteFiles(keys.slice(i, i + FILE_BATCH));
    }
    return { workOrders, files: keys.length };
}
