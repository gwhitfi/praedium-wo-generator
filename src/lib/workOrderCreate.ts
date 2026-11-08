// Server-only. Helpers shared by the work order form's actions, the Praedium Bot and the MCP route for creating
// and updating work orders.
import { randomBytes } from "node:crypto";
import type { Contact, WorkOrder } from "@/generated/prisma/client";
import prisma from "./prisma";
import { todayInAppTimeZone } from "./dates";
import { logEvent, type Actor } from "./workOrderEvents";
import type { ParsedConfirmedDraft } from "./workOrderConfirmed";

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

export type CreateDraftWorkOrderResult =
    | { ok: true; workOrder: { id: string; jobNumber: string } }
    | { ok: false; error: string };

// Creates a DRAFT work order from a confirmed draft (Praedium Bot or an outside assistant over MCP). The caller
// validates the draft with confirmedDraft and takes organizationId and actor from its own auth, never from the
// input. Every referenced ID is checked against the organization here. Returns an error instead of throwing.
export async function createDraftWorkOrder(args: {
    organizationId: string;
    actor: Actor;
    draft: ParsedConfirmedDraft;
    source: "bot" | "mcp";
}): Promise<CreateDraftWorkOrderResult> {
    const { organizationId, actor, draft, source } = args;
    const { propertyId, unitId, contractorId, dueDate, areas, ...fields } = draft;
    if (fields.inHouse && contractorId) {
        return { ok: false, error: "Choose a contractor or in-house, not both." };
    }

    const [property, unit, contractor] = await Promise.all([
        prisma.property.findFirst({ where: { id: propertyId, organizationId, archived: false } }),
        unitId ? prisma.unit.findFirst({ where: { id: unitId, propertyId, organizationId, archived: false } }) : null,
        contractorId
            ? prisma.contact.findFirst({
                  where: {
                      id: contractorId,
                      organizationId,
                      archived: false,
                      contactType: { in: ["CONTRACTOR", "OTHER"] },
                  },
              })
            : null,
    ]);
    if (!property) return { ok: false, error: "That property wasn't found. Choose it again." };
    if (unitId && !unit) return { ok: false, error: "That unit wasn't found. Choose it again." };
    if (contractorId && !contractor) return { ok: false, error: "That contractor wasn't found. Choose them again." };

    const tenant = await findTenant(unitId, organizationId);

    const workOrder = await prisma.$transaction(async (tx) =>
        tx.workOrder.create({
            data: {
                organizationId,
                jobNumber: await nextJobNumber(tx, organizationId),
                publicToken: randomBytes(24).toString("base64url"),
                propertyId,
                unitId,
                ...fields,
                dueDate: dueDate ? new Date(dueDate) : null,
                status: "DRAFT",
                ...contractorSnapshot(contractor),
                ...tenantSnapshot(tenant),
                areas: {
                    create: areas.map((area, areaIndex) => ({
                        name: area.name,
                        sortOrder: areaIndex,
                        lineItems: {
                            create: area.lineItems.map((item, itemIndex) => ({
                                description: item.description,
                                priority: item.priority,
                                sortOrder: itemIndex,
                            })),
                        },
                    })),
                },
            },
        }),
    );

    await logEvent({ type: "CREATED", workOrderId: workOrder.id, organizationId, actor, detail: { source } });

    return { ok: true, workOrder: { id: workOrder.id, jobNumber: workOrder.jobNumber } };
}
