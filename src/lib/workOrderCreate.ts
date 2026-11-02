// Server-only. Helpers shared by the work order form's actions and the Praedium Bot for creating and updating
// work orders.
import type { Contact, WorkOrder } from "@/generated/prisma/client";
import prisma from "./prisma";
import { todayInAppTimeZone } from "./dates";

export function findTenant(unitId: string | null, organizationId: string): Promise<Contact | null> {
    if (!unitId) return Promise.resolve(null);
    return prisma.contact.findFirst({
        where: { unitId, contactType: "TENANT", organizationId, archived: false },
    });
}

export function contractorSnapshot(
    contractor: { id: string; displayName: string; phone: string | null; email: string | null } | null,
): Pick<WorkOrder, "contractorId" | "contractorName" | "contractorPhone" | "contractorEmail"> {
    return {
        contractorId: contractor?.id ?? null,
        contractorName: contractor?.displayName ?? null,
        contractorPhone: contractor?.phone ?? null,
        contractorEmail: contractor?.email ?? null,
    };
}

export function tenantSnapshot(
    tenant: { id: string; displayName: string; phone: string | null; email: string | null } | null,
): Pick<WorkOrder, "tenantId" | "tenantName" | "tenantPhone" | "tenantEmail"> {
    return {
        tenantId: tenant?.id ?? null,
        tenantName: tenant?.displayName ?? null,
        tenantPhone: tenant?.phone ?? null,
        tenantEmail: tenant?.email ?? null,
    };
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export async function nextJobNumber(tx: Tx, organizationId: string): Promise<string> {
    const year = todayInAppTimeZone().getUTCFullYear();
    const [row] = await tx.$queryRaw<{ lastJobNumber: number }[]>`
        UPDATE "Organization"
        SET "lastJobNumber" = CASE WHEN "jobNumberYear" = ${year} THEN "lastJobNumber" + 1 ELSE 1001 END,
            "jobNumberYear" = ${year}
        WHERE "id" = ${organizationId}
        RETURNING "lastJobNumber"`;
    return `${year}-${row.lastJobNumber}`;
}
