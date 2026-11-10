import type { Prisma, WorkOrderStatus } from "@/generated/prisma/client";
import { todayInAppTimeZone } from "@/lib/dates";
import { unitLabel } from "@/lib/defaults";
import { hrefWithSort, sortRows, streetSortKey, type SortColumns, type SortState } from "@/lib/sorting";

export const OPEN_STATUSES: WorkOrderStatus[] = ["DRAFT", "SENT", "IN_PROGRESS"];

export function isOverdue(workOrder: { status: WorkOrderStatus; dueDate: Date | null }) {
    return !!workOrder.dueDate && workOrder.dueDate < todayInAppTimeZone() && OPEN_STATUSES.includes(workOrder.status);
}

type SendState = { status: WorkOrderStatus; sentAt: Date | null; startedAt: Date | null };

// A draft that was sent or started before: it was cancelled and reopened, and is about to go out again.
export function isReopenedDraft(workOrder: SendState): boolean {
    return workOrder.status === "DRAFT" && !!(workOrder.sentAt || workOrder.startedAt);
}

// Whether sending or starting a draft may email the tenant. The first time, the work order's own setting decides
// (notifyTenant() checks it). A reopened draft emails them again only when a person ticked "Email the tenant again"
// on the work order page; AI assistants (MCP) never pass it.
export function mayNotifyTenant(workOrder: SendState, notifyTenantAgain: boolean): boolean {
    return workOrder.status === "DRAFT" && (!isReopenedDraft(workOrder) || notifyTenantAgain);
}

// The work order list's filters, in the order the filter tabs show them (after "All").
export const WORK_ORDER_FILTERS = {
    // Sent or in progress, with a contractor or in-house: the work that's underway.
    active: {
        label: "Active",
        where: (): Prisma.WorkOrderWhereInput => ({ status: { in: ["SENT", "IN_PROGRESS"] } }),
    },
    draft: { label: "Drafts", where: (): Prisma.WorkOrderWhereInput => ({ status: "DRAFT" }) },
    completed: { label: "To review", where: (): Prisma.WorkOrderWhereInput => ({ status: "COMPLETED" }) },
    overdue: {
        label: "Overdue",
        where: (): Prisma.WorkOrderWhereInput => ({
            status: { in: OPEN_STATUSES },
            dueDate: { lt: todayInAppTimeZone() },
        }),
    },
    closed: { label: "Closed", where: (): Prisma.WorkOrderWhereInput => ({ status: "CLOSED" }) },
    archived: { label: "Archived", where: (): Prisma.WorkOrderWhereInput => ({ archived: true }) },
} as const;

export type WorkOrderFilter = keyof typeof WORK_ORDER_FILTERS;

// The "Split view by status" setting on /work-orders, saved per browser: "1" on, "0" off. On when not set.
export const SPLIT_VIEW_COOKIE = "wo-split-view";

// The "Color sections" setting on /work-orders: tints each split view section with its status color.
// Saved per browser like the split view setting, and off when not set (lists stay neutral unless asked).
export const COLOR_SECTIONS_COOKIE = "wo-color-sections";

export function isWorkOrderFilter(value: unknown): value is WorkOrderFilter {
    return typeof value === "string" && Object.hasOwn(WORK_ORDER_FILTERS, value);
}

export const STATUS_ORDER: WorkOrderStatus[] = ["DRAFT", "SENT", "IN_PROGRESS", "COMPLETED", "CLOSED", "CANCELLED"];

type SortableWorkOrder = {
    jobNumber: string;
    title: string;
    status: WorkOrderStatus;
    dueDate: Date | null;
    contractorName: string | null;
    // Only loaded where the list can sort by contractor; without it, the name on the work order is used.
    contractor?: { firstName: string | null; lastName: string | null } | null;
    property: { addressLine1: string };
    unit: { name: string; isDefault: boolean } | null;
};

export type WorkOrderSort = "number" | "title" | "status" | "due" | "property" | "contractor";

export const WORK_ORDER_SORTS: SortColumns<SortableWorkOrder, WorkOrderSort> = {
    // "2026-1001": the collator compares the year, then the number, by value. Newest first.
    number: { value: (wo) => wo.jobNumber, firstDir: "desc" },
    title: { value: (wo) => wo.title },
    status: { value: (wo) => STATUS_ORDER.indexOf(wo.status) },
    due: { value: (wo) => wo.dueDate, firstDir: "desc" },
    property: {
        value: (wo) => [
            ...streetSortKey(wo.property.addressLine1),
            wo.unit && !wo.unit.isDefault ? wo.unit.name : null,
        ],
    },
    contractor: {
        value: (wo) =>
            wo.contractor?.lastName?.trim()
                ? [wo.contractor.lastName, wo.contractor.firstName]
                : [wo.contractorName, null],
    },
};

// How the work order list is shown: the filter, sort and search text from the URL, and the split view setting.
// `query` is "" (or left out) when nothing is searched.
export type WorkOrderListView = {
    filter: WorkOrderFilter | null;
    sort: SortState<WorkOrderSort> | null;
    split: boolean;
    query?: string;
};

// Puts work orders in the order the list shows them. Split view groups them by status in workflow order (drafts
// first), each group sorted, so the rows read top to bottom across the sections.
export function orderForView<T extends SortableWorkOrder>(
    rows: T[],
    view: Pick<WorkOrderListView, "sort" | "split">,
): T[] {
    const sorted = sortRows(rows, WORK_ORDER_SORTS, view.sort);
    if (!view.split) return sorted;
    return STATUS_ORDER.flatMap((status) => sorted.filter((row) => row.status === status));
}

// The view's filter, search and sort as a query string ("?status=overdue&q=roof&sort=due&dir=desc", or "" for the
// default), added to work order links so the work order page knows which list it was opened from.
export function listQuery(view: Pick<WorkOrderListView, "filter" | "sort" | "query">): string {
    return hrefWithSort("", view.sort, {
        ...(view.filter ? { status: view.filter } : {}),
        ...(view.query ? { q: view.query } : {}),
    });
}

// The work orders before and after `id` in an ordered list, and its position. Null if it isn't in the list.
export function findNeighbors(
    ids: string[],
    id: string,
): { position: number; total: number; previousId: string | null; nextId: string | null } | null {
    const index = ids.indexOf(id);
    if (index === -1) return null;
    return {
        position: index + 1,
        total: ids.length,
        previousId: ids[index - 1] ?? null,
        nextId: ids[index + 1] ?? null,
    };
}

type AddressProperty = { addressLine1: string; city: string; state: string; zipCode: string };
type AddressUnit = { name: string; isDefault: boolean } | null;

export function formatWorkOrderAddress(property: AddressProperty, unit: AddressUnit) {
    return (
        `${property.addressLine1}${unit && !unit.isDefault ? `, ${unitLabel(unit.name)}` : ""}, ` +
        `${property.city}, ${property.state} ${property.zipCode}`
    );
}
