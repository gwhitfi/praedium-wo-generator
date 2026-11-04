// Server-only. Work order reads for the MCP tools: compact rows for list_work_orders, full detail for
// get_work_order and the organization's history for list_activity. Every query is scoped to the API key's
// organization.
import type { DeliveryMethod, LineItemPriority, WorkOrderEventType, WorkOrderStatus } from "@/generated/prisma/client";
import prisma from "@/lib/prisma";
import { describeEvent } from "@/lib/activity";
import { unitLabel } from "@/lib/defaults";

// Most history entries returned, as on the work order page.
const ACTIVITY_LIMIT = 200;

export type WorkOrderListFilters = {
    status?: WorkOrderStatus;
    propertyId?: string;
    contractorId?: string;
    unitId?: string;
    query?: string;
    includeArchived?: boolean;
    limit: number;
};

export type WorkOrderRow = {
    id: string;
    jobNumber: string;
    status: WorkOrderStatus;
    // Only when archived work orders were asked for.
    archived?: boolean;
    title: string;
    property: string;
    unit: string | null;
    contractor: string | null;
    dueDate: string | null;
    createdAt: string;
    updatedAt: string;
};

type ContactSnapshot = { id: string | null; name: string | null; phone: string | null; email: string | null };

export type WorkOrderDetail = {
    id: string;
    jobNumber: string;
    status: WorkOrderStatus;
    archived: boolean;
    title: string;
    notes: string | null;
    dueDate: string | null;
    deliveryMethod: DeliveryMethod | null;
    notifyTenant: boolean;
    property: {
        id: string;
        name: string;
        addressLine1: string;
        addressLine2: string | null;
        city: string;
        state: string;
        zipCode: string;
    };
    unit: { id: string; label: string } | null;
    contractor: ContactSnapshot | null;
    tenant: ContactSnapshot | null;
    areas: {
        id: string;
        name: string;
        lineItems: {
            id: string;
            description: string;
            priority: LineItemPriority;
            completed: boolean;
            completedAt: string | null;
            contractorNotes: string | null;
        }[];
    }[];
    createdAt: string;
    updatedAt: string;
    sentAt: string | null;
    completedAt: string | null;
    closedAt: string | null;
    cancelledAt: string | null;
    cancelReason: string | null;
    completionNotes: string | null;
    // Newest first, worded as in the work order's Activity section.
    activity: { type: string; text: string; note?: string; createdAt: string }[];
};

// Due dates are stored as midnight UTC.
const isoDate = (date: Date | null): string | null => (date ? date.toISOString().slice(0, 10) : null);
const isoTime = (date: Date | null): string | null => (date ? date.toISOString() : null);

// Null when the work order has no contact of that kind, now or in its copied details.
function snapshot(contact: ContactSnapshot): ContactSnapshot | null {
    return contact.id || contact.name ? contact : null;
}

// The organization's work orders, newest first; archived ones only with `includeArchived`. `query` matches the
// title or job number.
export async function listWorkOrders(organizationId: string, filters: WorkOrderListFilters): Promise<WorkOrderRow[]> {
    const { status, propertyId, contractorId, unitId, query, includeArchived = false, limit } = filters;
    const rows = await prisma.workOrder.findMany({
        where: {
            organizationId,
            ...(includeArchived ? {} : { archived: false }),
            ...(status ? { status } : {}),
            ...(propertyId ? { propertyId } : {}),
            ...(contractorId ? { contractorId } : {}),
            ...(unitId ? { unitId } : {}),
            ...(query
                ? {
                      OR: [
                          { title: { contains: query, mode: "insensitive" } },
                          { jobNumber: { contains: query, mode: "insensitive" } },
                      ],
                  }
                : {}),
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
            id: true,
            jobNumber: true,
            status: true,
            archived: true,
            title: true,
            dueDate: true,
            createdAt: true,
            updatedAt: true,
            contractorName: true,
            property: { select: { displayName: true } },
            unit: { select: { name: true } },
        },
    });

    return rows.map((row) => ({
        id: row.id,
        jobNumber: row.jobNumber,
        status: row.status,
        ...(includeArchived ? { archived: row.archived } : {}),
        title: row.title,
        property: row.property.displayName,
        unit: row.unit ? unitLabel(row.unit.name) : null,
        contractor: row.contractorName,
        dueDate: isoDate(row.dueDate),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    }));
}

// One work order of the organization, archived or not, with its areas and history. Null if it isn't theirs.
export async function getWorkOrder(organizationId: string, id: string): Promise<WorkOrderDetail | null> {
    const workOrder = await prisma.workOrder.findFirst({
        where: { id, organizationId },
        include: {
            property: true,
            unit: { select: { id: true, name: true } },
            areas: {
                orderBy: { sortOrder: "asc" },
                include: { lineItems: { orderBy: { sortOrder: "asc" } } },
            },
        },
    });
    if (!workOrder) return null;

    const events = await prisma.workOrderEvent.findMany({
        where: { workOrderId: workOrder.id, organizationId },
        orderBy: { createdAt: "desc" },
        take: ACTIVITY_LIMIT,
        select: { type: true, createdAt: true, actorName: true, byContractor: true, detail: true },
    });

    const { property } = workOrder;
    return {
        id: workOrder.id,
        jobNumber: workOrder.jobNumber,
        status: workOrder.status,
        archived: workOrder.archived,
        title: workOrder.title,
        notes: workOrder.notes,
        dueDate: isoDate(workOrder.dueDate),
        deliveryMethod: workOrder.deliveryMethod,
        notifyTenant: workOrder.notifyTenant,
        property: {
            id: property.id,
            name: property.displayName,
            addressLine1: property.addressLine1,
            addressLine2: property.addressLine2,
            city: property.city,
            state: property.state,
            zipCode: property.zipCode,
        },
        unit: workOrder.unit ? { id: workOrder.unit.id, label: unitLabel(workOrder.unit.name) } : null,
        contractor: snapshot({
            id: workOrder.contractorId,
            name: workOrder.contractorName,
            phone: workOrder.contractorPhone,
            email: workOrder.contractorEmail,
        }),
        tenant: snapshot({
            id: workOrder.tenantId,
            name: workOrder.tenantName,
            phone: workOrder.tenantPhone,
            email: workOrder.tenantEmail,
        }),
        areas: workOrder.areas.map((area) => ({
            id: area.id,
            name: area.name,
            lineItems: area.lineItems.map((item) => ({
                id: item.id,
                description: item.description,
                priority: item.priority,
                completed: item.completed,
                completedAt: isoTime(item.completedAt),
                contractorNotes: item.contractorNotes,
            })),
        })),
        createdAt: workOrder.createdAt.toISOString(),
        updatedAt: workOrder.updatedAt.toISOString(),
        sentAt: isoTime(workOrder.sentAt),
        completedAt: isoTime(workOrder.completedAt),
        closedAt: isoTime(workOrder.closedAt),
        cancelledAt: isoTime(workOrder.cancelledAt),
        cancelReason: workOrder.cancelReason,
        completionNotes: workOrder.completionNotes,
        activity: events.map((event) => {
            const line = describeEvent(event);
            return {
                type: event.type,
                text: line.text,
                ...(line.note ? { note: line.note } : {}),
                createdAt: event.createdAt.toISOString(),
            };
        }),
    };
}

export type ActivityFilters = {
    workOrderId?: string;
    // ISO date-time; only events at or after it.
    since?: string;
    types?: WorkOrderEventType[];
    limit: number;
};

export type ActivityRow = {
    type: WorkOrderEventType;
    text: string;
    note?: string;
    createdAt: string;
    workOrder: { id: string; jobNumber: string; title: string };
};

// The organization's history across work orders, newest first, worded as on the work order page. Null when
// `workOrderId` is given but isn't one of the organization's work orders.
export async function listActivity(organizationId: string, filters: ActivityFilters): Promise<ActivityRow[] | null> {
    const { workOrderId, since, types, limit } = filters;
    if (workOrderId) {
        const workOrder = await prisma.workOrder.findFirst({
            where: { id: workOrderId, organizationId },
            select: { id: true },
        });
        if (!workOrder) return null;
    }

    const events = await prisma.workOrderEvent.findMany({
        where: {
            organizationId,
            ...(workOrderId ? { workOrderId } : {}),
            ...(since ? { createdAt: { gte: new Date(since) } } : {}),
            ...(types && types.length > 0 ? { type: { in: types } } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
            type: true,
            createdAt: true,
            actorName: true,
            byContractor: true,
            detail: true,
            workOrder: { select: { id: true, jobNumber: true, title: true } },
        },
    });

    return events.map((event) => {
        const line = describeEvent(event);
        return {
            type: event.type,
            text: line.text,
            ...(line.note ? { note: line.note } : {}),
            createdAt: event.createdAt.toISOString(),
            workOrder: event.workOrder,
        };
    });
}
