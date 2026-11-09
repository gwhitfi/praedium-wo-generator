import { cookies } from "next/headers";
import prisma from "@/lib/prisma";
import { parseSort, type SearchParams } from "@/lib/sorting";
import { matchesSearch, readQuery } from "@/lib/search";
import {
    COLOR_SECTIONS_COOKIE,
    SPLIT_VIEW_COOKIE,
    WORK_ORDER_FILTERS,
    WORK_ORDER_SORTS,
    findNeighbors,
    isWorkOrderFilter,
    listQuery,
    orderForView,
    type WorkOrderListView,
} from "@/lib/workOrders";

// Server-only. The Work orders page and the work order page's arrows both build the list here,
// so the arrows always follow the order the list shows.

// Reads the list view from the URL (?status, ?q, ?sort, ?dir) and the split view cookie.
export async function readWorkOrderListView(params: SearchParams): Promise<WorkOrderListView> {
    return {
        filter: isWorkOrderFilter(params.status) ? params.status : null,
        sort: parseSort(params, WORK_ORDER_SORTS),
        split: (await cookies()).get(SPLIT_VIEW_COOKIE)?.value !== "0",
        query: readQuery(params.q),
    };
}

// The "Color sections" setting. Kept out of WorkOrderListView because it only changes how the list looks.
export async function readColorSections(): Promise<boolean> {
    return (await cookies()).get(COLOR_SECTIONS_COOKIE)?.value === "1";
}

// The organization's work orders for a view, in the order the list shows them.
export async function getWorkOrderList(organizationId: string, view: WorkOrderListView) {
    const workOrders = await prisma.workOrder.findMany({
        where: {
            organizationId,
            archived: false,
            ...(view.filter ? WORK_ORDER_FILTERS[view.filter].where() : {}),
        },
        orderBy: { createdAt: "desc" },
        include: {
            property: true,
            unit: true,
            contractor: { select: { firstName: true, lastName: true } },
        },
    });

    const matches = view.query
        ? workOrders.filter((wo) => matchesSearch(view.query ?? "", workOrderSearchFields(wo)))
        : workOrders;
    return orderForView(matches, view);
}

// What a work order search looks at: number, title, address, unit, contractor and tenant.
export function workOrderSearchFields(wo: {
    jobNumber: string;
    title: string | null;
    contractorName: string | null;
    tenantName: string | null;
    property: { displayName: string; addressLine1: string; city: string };
    unit: { name: string } | null;
}): (string | null)[] {
    return [
        wo.jobNumber,
        wo.title,
        wo.property.displayName,
        wo.property.addressLine1,
        wo.property.city,
        wo.unit?.name ?? null,
        wo.contractorName,
        wo.tenantName,
    ];
}

export type WorkOrderPagerLinks = {
    position: number;
    total: number;
    previousHref: string | null;
    nextHref: string | null;
};

// Links to the work orders before and after this one in the list it was opened from. If it no longer matches
// that list's filter (say it was just sent from "Drafts"), the All list with the same sort is used instead.
// Null if it isn't in either, such as an archived work order opened from the All list.
export async function getWorkOrderPager(
    organizationId: string,
    view: WorkOrderListView,
    workOrderId: string,
): Promise<WorkOrderPagerLinks | null> {
    const views = view.filter ? [view, { ...view, filter: null }] : [view];

    for (const candidate of views) {
        const list = await getWorkOrderList(organizationId, candidate);
        const neighbors = findNeighbors(
            list.map((wo) => wo.id),
            workOrderId,
        );
        if (!neighbors) continue;

        const query = listQuery(candidate);
        const href = (id: string | null) => (id ? `/work-orders/${id}${query}` : null);
        return {
            position: neighbors.position,
            total: neighbors.total,
            previousHref: href(neighbors.previousId),
            nextHref: href(neighbors.nextId),
        };
    }

    return null;
}
