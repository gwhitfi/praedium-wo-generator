import type { Prisma } from "@/generated/prisma/client";
import { STATUS_COLORS, unitLabel, WORK_ORDER_STATUS_LABELS } from "@/lib/defaults";
import { isOverdue, type WorkOrderSort } from "@/lib/workOrders";
import type { SortLabel } from "@/lib/sorting";
import { List, ListHeader, ListRow, Cell } from "@/components/list/List";
import { formatDueDate } from "@/lib/dates";

export type WorkOrderWithPlace = Prisma.WorkOrderGetPayload<{ include: { property: true; unit: true } }>;

const COLS =
    "sm:grid-cols-[5.5rem_minmax(0,1.6fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1.8fr)_minmax(0,1.2fr)]";
const COLS_NO_CONTRACTOR = "sm:grid-cols-[5.5rem_minmax(0,1.6fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1.8fr)]";

// Background classes that replace the list's surface colors, such as a status color.
export type ListTint = { rows: string; header: string };

// Pass `label` (from sortLabels) to make the headers sortable; the caller sorts the rows.
// `linkQuery` (from listQuery) is added to each row's link, for the work order page's arrows.
export function WorkOrderList({
    workOrders,
    hideContractor = false,
    label,
    linkQuery = "",
    tint,
}: {
    workOrders: WorkOrderWithPlace[];
    hideContractor?: boolean;
    label?: (label: string, key: WorkOrderSort) => SortLabel;
    linkQuery?: string;
    tint?: ListTint;
}) {
    const header = (text: string, key: WorkOrderSort) => (label ? label(text, key) : text);
    const labels = [
        header("#", "number"),
        header("Title", "title"),
        header("Status", "status"),
        header("Due", "due"),
        header("Property", "property"),
        ...(hideContractor ? [] : [header("Contractor", "contractor")]),
    ];

    return (
        <List tint={tint?.rows}>
            <ListHeader cols={hideContractor ? COLS_NO_CONTRACTOR : COLS} labels={labels} tint={tint?.header} />
            {workOrders.map((workOrder) => (
                <WorkOrderRow
                    key={workOrder.id}
                    workOrder={workOrder}
                    hideContractor={hideContractor}
                    linkQuery={linkQuery}
                />
            ))}
        </List>
    );
}

export default function WorkOrderRow({
    workOrder,
    hideContractor = false,
    linkQuery = "",
}: {
    workOrder: WorkOrderWithPlace;
    hideContractor?: boolean;
    linkQuery?: string;
}) {
    const overdue = isOverdue(workOrder);

    return (
        <ListRow
            href={`/work-orders/${workOrder.id}${linkQuery}`}
            label={`View ${workOrder.title ?? "untitled work order"}`}
            cols={hideContractor ? COLS_NO_CONTRACTOR : COLS}
        >
            <Cell className="hidden whitespace-nowrap text-subtle sm:block">#{workOrder.jobNumber}</Cell>
            <Cell className="basis-full truncate font-medium">
                <span className="mr-2 font-normal text-subtle sm:hidden">#{workOrder.jobNumber}</span>
                {workOrder.title ??<span className="italic text-subtle">Untitled work order</span>}
            </Cell>
            <Cell>
                <span className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_COLORS[workOrder.status]}`}>
                    {WORK_ORDER_STATUS_LABELS[workOrder.status]}
                </span>
            </Cell>
            <Cell className={overdue ? "text-danger" : "text-muted"}>
                {workOrder.dueDate && (
                    <>
                        <span className="sm:hidden">Due </span>
                        {formatDueDate(workOrder.dueDate)}
                        {overdue && <span className="sm:hidden"> · Overdue</span>}
                    </>
                )}
            </Cell>
            <Cell className="basis-full truncate text-muted">
                {workOrder.property.addressLine1}
                {workOrder.unit && !workOrder.unit.isDefault && `, ${unitLabel(workOrder.unit.name)}`}
            </Cell>
            {!hideContractor && (
                <Cell className="basis-full truncate text-muted">{workOrder.contractorName}</Cell>
            )}
        </ListRow>
    );
}
