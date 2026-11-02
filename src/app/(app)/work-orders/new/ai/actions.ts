"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { contractorSnapshot, findTenant, nextJobNumber, tenantSnapshot } from "@/lib/workOrderCreate";
import { confirmedDraft, type ConfirmedDraft } from "./schemas";

type CreateDraftResult = { ok: false; error: string };

// Creates a DRAFT work order from the reviewed bot draft, then opens it. Returns an error instead of throwing,
// so the review screen keeps the user's description and choices.
export async function createDraftFromBot(input: ConfirmedDraft): Promise<CreateDraftResult> {
    const result = await getCurrentUser();
    if (result.state !== "ready") return { ok: false, error: "Not authorized" };

    const parsed = confirmedDraft.safeParse(input);
    if (!parsed.success) {
        return { ok: false, error: "Some details are missing or too long. Check the work order and try again." };
    }

    const organizationId = result.organization.id;
    const { propertyId, unitId, contractorId, dueDate, areas, ...fields } = parsed.data;

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

    revalidatePath("/work-orders");
    redirect(`/work-orders/${workOrder.id}`);
}
