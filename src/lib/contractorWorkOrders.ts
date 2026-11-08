// Server-only. The contractor's view of their work orders: the token's work order, and the list of the same
// organization's current work orders that were sent to the same contractor email.
import prisma from "@/lib/prisma";
import type { Prisma, WorkOrderStatus } from "@/generated/prisma/client";
import type { WorkOrderWithPlace } from "@/components/WorkOrderRow";

export const CONTRACTOR_LIST_STATUSES: WorkOrderStatus[] = ["SENT", "IN_PROGRESS", "COMPLETED"];

export type ContractorWorkOrder = Prisma.WorkOrderGetPayload<{
    include: { organization: { select: { name: true } } };
}>;

// The work order a contractor link points at, with the organization's name, or null if the link doesn't work
// (missing, archived, in-house, draft or cancelled). Same rule as the contractor page.
export async function getContractorWorkOrder(token: string): Promise<ContractorWorkOrder | null> {
    const workOrder = await prisma.workOrder.findUnique({
        where: { publicToken: token },
        include: { organization: { select: { name: true } } },
    });
    if (
        !workOrder ||
        workOrder.archived ||
        workOrder.inHouse ||
        workOrder.status === "DRAFT" ||
        workOrder.status === "CANCELLED"
    ) {
        return null;
    }
    return workOrder;
}

// Emails are compared trimmed and lower-cased, in code. Prisma's `mode: "insensitive"` is a pattern match in
// Postgres, where an underscore in the email would match any character and could pull in another contractor's rows.
export function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

// The areas as the unverified (or closed) view may show them: line item text and priority only, no contractor
// notes and no photo ids, so nothing sensitive reaches the client payload.
export function summaryAreas<A extends { lineItems: { contractorNotes: string | null; attachments: unknown[] }[] }>(
    areas: A[],
): A[] {
    return areas.map((area) => ({
        ...area,
        lineItems: area.lineItems.map((item) => ({ ...item, contractorNotes: null, attachments: [] })),
    }));
}

// Only a current work order with a contractor email can be used to look up the contractor's list: a closed
// link shouldn't keep unlocking future work indefinitely.
export function canLookup(workOrder: { status: WorkOrderStatus; contractorEmail: string | null }): boolean {
    return !!workOrder.contractorEmail && CONTRACTOR_LIST_STATUSES.includes(workOrder.status);
}

// "j•••@joesplumbing.com": the first character, then everything from the @ on. Shown to someone who only has the
// link, so the full address isn't given away.
export function maskEmail(email: string): string {
    const normalized = normalizeEmail(email);
    const at = normalized.indexOf("@");
    if (at <= 0) return "•••";
    return `${normalized[0]}•••${normalized.slice(at)}`;
}

// The organization's current work orders sent to this work order's contractor email, soonest due first (no due date
// last), then newest first. The caller checks the contractor is verified for that email first.
export async function listContractorWorkOrders(workOrder: ContractorWorkOrder): Promise<WorkOrderWithPlace[]> {
    if (!canLookup(workOrder)) return [];
    const target = normalizeEmail(workOrder.contractorEmail ?? "");

    const rows = await prisma.workOrder.findMany({
        where: {
            organizationId: workOrder.organizationId,
            archived: false,
            status: { in: CONTRACTOR_LIST_STATUSES },
            contractorEmail: { not: null },
        },
        orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
        include: { property: true, unit: true },
    });
    return rows.filter((row) => row.contractorEmail !== null && normalizeEmail(row.contractorEmail) === target);
}

// How many of those work orders there are besides this one, for the "View your other work orders" button.
export async function countContractorWorkOrders(workOrder: {
    id: string;
    organizationId: string;
    status: WorkOrderStatus;
    contractorEmail: string | null;
}): Promise<number> {
    if (!canLookup(workOrder)) return 0;
    const target = normalizeEmail(workOrder.contractorEmail ?? "");

    const rows = await prisma.workOrder.findMany({
        where: {
            organizationId: workOrder.organizationId,
            id: { not: workOrder.id },
            archived: false,
            status: { in: CONTRACTOR_LIST_STATUSES },
            contractorEmail: { not: null },
        },
        select: { contractorEmail: true },
    });
    return rows.filter((row) => row.contractorEmail !== null && normalizeEmail(row.contractorEmail) === target).length;
}
