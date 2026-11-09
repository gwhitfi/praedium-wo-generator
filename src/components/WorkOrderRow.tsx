import type { Prisma, WorkOrderStatus } from "@/generated/prisma/client";
import { assigneeName, unitLabel } from "@/lib/defaults";
import { isOverdue, type WorkOrderSort } from "@/lib/workOrders";
import type { SortLabel } from "@/lib/sorting";
import { List, ListHeader, ListRow, Cell, RowLink, ROW_COLS } from "@/components/list/List";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDueDate } from "@/lib/dates";

export type WorkOrderWithPlace = Prisma.WorkOrderGetPayload<{ include: { property: true; unit: true } }>;

// Background classes that replace the list's surface colors, such as a status color.
export type ListTint = { rows: string; header: string };

// A light wash of each status color behind its section's rows, and a slightly deeper one on its header row.
// Written out in full so Tailwind generates the classes.
export const SECTION_TINTS: Record<WorkOrderStatus, ListTint> = {
    DRAFT: { rows: "bg-status-draft/[0.03]", header: "bg-status-draft/8" },
    SENT: { rows: "bg-status-sent/[0.03]", header: "bg-status-sent/8" },
    IN_PROGRESS: { rows: "bg-status-in-progress/[0.03]", header: "bg-status-in-progress/8" },
    COMPLETED: { rows: "bg-status-completed/[0.03]", header: "bg-status-completed/8" },
    CLOSED: { rows: "bg-status-closed/[0.03]", header: "bg-status-closed/8" },
    CANCELLED: { rows: "bg-status-cancelled/[0.03]", header: "bg-status-cancelled/8" },
};

// Pass `label` (from sortLabels) to make the headers sortable; the caller sorts the rows.
// `linkQuery` (from listQuery) is added to each row's link, for the work order page's arrows.
// `href` replaces the row link, for the contractor's list. `hideContractor`, `hideProperty` and `hideStatus` drop a
// column that would repeat what the page or section already says (a contractor's page, a property's page, a
// section that is one status).
export function WorkOrderList({
    workOrders,
    hideContractor = false,
    hideProperty = false,
    hideStatus = false,
    label,
    linkQuery = "",
    tint,
    href,
    tableLabel = "Work orders",
}: {
    workOrders: WorkOrderWithPlace[];
    hideContractor?: boolean;
    hideProperty?: boolean;
    hideStatus?: boolean;
    label?: (label: string, key: WorkOrderSort) => SortLabel;
    linkQuery?: string;
    tint?: ListTint;
    href?: (workOrder: WorkOrderWithPlace) => string;
    tableLabel?: string;
}): React.ReactElement {
    const header = (text: string, key: WorkOrderSort) => (label ? label(text, key) : text);
    const columns: { label: string | SortLabel; width: string }[] = [
        { label: header("Job", "number"), width: "6rem" },
        { label: header("Title", "title"), width: "minmax(0,2.3fr)" },
        ...(hideStatus ? [] : [{ label: header("Status", "status"), width: "7.5rem" }]),
        { label: header("Due", "due"), width: "6.5rem" },
        ...(hideProperty ? [] : [{ label: header("Property", "property"), width: "minmax(0,1.5fr)" }]),
        ...(hideContractor ? [] : [{ label: header("Contractor", "contractor"), width: "minmax(0,1fr)" }]),
    ];

    return (
        <List tint={tint?.rows} label={tableLabel} columns={columns.map((c) => c.width).join(" ")}>
            <ListHeader cols={ROW_COLS} labels={columns.map((c) => c.label)} tint={tint?.header} />
            {workOrders.map((workOrder) => (
                <WorkOrderRow
                    key={workOrder.id}
                    workOrder={workOrder}
                    hideContractor={hideContractor}
                    hideProperty={hideProperty}
                    hideStatus={hideStatus}
                    linkQuery={linkQuery}
                    href={href}
                />
            ))}
        </List>
    );
}

function WorkOrderRow({
    workOrder,
    hideContractor,
    hideProperty,
    hideStatus,
    linkQuery,
    href,
}: {
    workOrder: WorkOrderWithPlace;
    hideContractor: boolean;
    hideProperty: boolean;
    hideStatus: boolean;
    linkQuery: string;
    href?: (workOrder: WorkOrderWithPlace) => string;
}): React.ReactElement {
    const overdue = isOverdue(workOrder);
    const place = `${workOrder.property.addressLine1}${
        workOrder.unit && !workOrder.unit.isDefault ? `, ${unitLabel(workOrder.unit.name)}` : ""
    }`;
    const assignee = assigneeName(workOrder);
    // On phones the address and the contractor share one line of the card.
    const mobilePlace = [hideProperty ? null : place, hideContractor ? null : assignee].filter(Boolean).join(" · ");

    return (
        <ListRow cols={ROW_COLS}>
            <Cell className="whitespace-nowrap tabular-nums text-subtle list-narrow:hidden">#{workOrder.jobNumber}</Cell>
            <Cell className="font-medium text-foreground">
                <RowLink
                    href={href ? href(workOrder) : `/work-orders/${workOrder.id}${linkQuery}`}
                    className="line-clamp-2 [overflow-wrap:anywhere] hover:underline"
                >
                    {workOrder.title ?? <span className="font-normal italic text-subtle">Untitled work order</span>}
                    <span className="sr-only"> (job #{workOrder.jobNumber})</span>
                </RowLink>
            </Cell>
            {/* As a card, the title leads and the job number, status and due date share the line under it, in the
                same order as the page's code, so screen readers read what's shown. In the table this is the Status
                cell, so without a Status column it's card-only, or the row would have one cell too many. */}
            <Cell className={hideStatus ? "list-wide:hidden" : ""}>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 list-wide:block">
                    <span className="whitespace-nowrap tabular-nums text-[0.8125rem] text-subtle list-wide:hidden">
                        #{workOrder.jobNumber}
                    </span>
                    {!hideStatus && <StatusBadge status={workOrder.status} />}
                    {workOrder.dueDate && (
                        <span
                            className={`whitespace-nowrap text-[0.8125rem] list-wide:hidden ${overdue ? "font-medium text-danger" : "text-muted"}`}
                        >
                            {overdue ? "Overdue · " : "Due "}
                            {formatDueDate(workOrder.dueDate)}
                        </span>
                    )}
                </span>
            </Cell>
            <Cell
                className={`whitespace-nowrap list-narrow:hidden ${overdue ? "font-medium text-danger" : "text-muted"}`}
            >
                {workOrder.dueDate ? (
                    <>
                        {formatDueDate(workOrder.dueDate)}
                        {overdue && <span className="block text-[0.8125rem] font-normal">Overdue</span>}
                    </>
                ) : (
                    <span className="text-subtle">—</span>
                )}
            </Cell>
            {mobilePlace && <Cell className="line-clamp-2 text-muted list-wide:hidden">{mobilePlace}</Cell>}
            {!hideProperty && (
                <Cell className="text-muted list-narrow:hidden">
                    <span className="line-clamp-2" title={place}>
                        {place}
                    </span>
                </Cell>
            )}
            {!hideContractor && (
                <Cell className="text-muted list-narrow:hidden">
                    <span className="line-clamp-2" title={assignee ?? undefined}>
                        {assignee ?? <span className="text-subtle">—</span>}
                    </span>
                </Cell>
            )}
        </ListRow>
    );
}
