import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import PageHeader from "@/components/list/PageHeader";
import EmptyState from "@/components/list/EmptyState";
import { SECTION_TINTS, WorkOrderList, type WorkOrderWithPlace } from "@/components/WorkOrderRow";
import { WORK_ORDER_STATUS_LABELS } from "@/lib/defaults";
import {
    STATUS_ORDER,
    WORK_ORDER_FILTERS,
    WORK_ORDER_SORTS,
    listQuery,
    type WorkOrderFilter,
    type WorkOrderSort,
} from "@/lib/workOrders";
import { getWorkOrderList, readColorSections, readWorkOrderListView } from "@/lib/workOrderList";
import { hrefWithSort, sortLabels, type SearchParams, type SortLabel, type SortState } from "@/lib/sorting";
import FilterMenu, { type FilterOption } from "./FilterMenu";
import ListSettings from "./ListSettings";

export default async function WorkOrder({ searchParams }: { searchParams: Promise<SearchParams> }) {
    const result = await getCurrentUser();

    if (result.state === "signed-out") {
        redirect("/sign-in");
    }

    if (result.state === "needs-org") {
        redirect("/setup");
    }

    const params = await searchParams;
    const view = await readWorkOrderListView(params);
    const { filter, sort, split: splitView } = view;
    const workOrders = await getWorkOrderList(result.organization.id, view);
    const colorSections = await readColorSections();

    const noun = workOrders.length === 1 ? "work order" : "work orders";
    const label = sortLabels("/work-orders", params, WORK_ORDER_SORTS, sort);
    const linkQuery = listQuery(view);

    return (
        <main className="mx-auto max-w-5xl px-4 py-10 text-foreground">
            <PageHeader
                title="Work orders"
                subtitle={`${workOrders.length} ${noun}`}
                actionHref="/work-orders/new"
                actionLabel="New work order"
            />

            <div className="mb-4 flex items-center gap-2">
                <Filters active={filter} sort={sort} />
                <ListSettings splitView={splitView} colorSections={colorSections} />
            </div>

            {workOrders.length === 0 ? (
                filter ? (
                    <EmptyState
                        message="No work orders match this filter."
                        actionHref="/work-orders"
                        actionLabel="Show all work orders"
                    />
                ) : (
                    <EmptyState
                        message="No work orders added yet."
                        actionHref="/work-orders/new"
                        actionLabel="Create your first work order"
                    />
                )
            ) : splitView ? (
                <SplitList
                    workOrders={workOrders}
                    label={label}
                    linkQuery={linkQuery}
                    colorSections={colorSections}
                />
            ) : (
                <WorkOrderList workOrders={workOrders} label={label} linkQuery={linkQuery} />
            )}
        </main>
    );
}

// One section per status, in workflow order. Empty sections are left out.
function SplitList({
    workOrders,
    label,
    linkQuery,
    colorSections,
}: {
    workOrders: WorkOrderWithPlace[];
    label: (label: string, key: WorkOrderSort) => SortLabel;
    linkQuery: string;
    colorSections: boolean;
}) {
    return (
        <div className="flex flex-col gap-8">
            {STATUS_ORDER.map((status) => {
                const rows = workOrders.filter((wo) => wo.status === status);
                if (rows.length === 0) return null;

                return (
                    <section key={status}>
                        <h2 className="mb-3 flex items-baseline gap-2 text-lg font-semibold">
                            {WORK_ORDER_STATUS_LABELS[status]}
                            <span className="text-sm font-normal text-subtle">{rows.length}</span>
                        </h2>
                        <WorkOrderList
                            workOrders={rows}
                            label={label}
                            linkQuery={linkQuery}
                            tint={colorSections ? SECTION_TINTS[status] : undefined}
                        />
                    </section>
                );
            })}
        </div>
    );
}

function Filters({ active, sort }: { active: WorkOrderFilter | null; sort: SortState<WorkOrderSort> | null }) {
    const chips: { key: WorkOrderFilter | null; label: string }[] = [
        { key: null, label: "All" },
        ...(Object.keys(WORK_ORDER_FILTERS) as WorkOrderFilter[]).map((key) => ({
            key,
            label: WORK_ORDER_FILTERS[key].label,
        })),
    ];

    const options: FilterOption[] = chips.map((chip) => ({
        label: chip.label,
        href: hrefWithSort("/work-orders", sort, chip.key ? { status: chip.key } : {}),
        active: chip.key === active,
    }));

    return (
        <nav aria-label="Filter work orders">
            <FilterMenu options={options} />
        </nav>
    );
}
