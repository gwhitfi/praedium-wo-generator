import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/list/PageHeader";
import EmptyState from "@/components/list/EmptyState";
import { MobileSort } from "@/components/list/List";
import SearchBox from "@/components/SearchBox";
import FilterTabs from "@/components/list/FilterTabs";
import { CollapsibleSection, SectionMenu } from "@/components/list/Sections";
import { ClipboardIcon, SearchIcon } from "@/components/Icons";
import { SECTION_TINTS, WorkOrderList, type WorkOrderWithPlace } from "@/components/WorkOrderRow";
import { STATUS_DOTS, WORK_ORDER_STATUS_LABELS } from "@/lib/defaults";
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
import { buttonClass, pageClass } from "@/lib/ui";
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
    const { filter, sort, split: splitView, query = "" } = view;
    const workOrders = await getWorkOrderList(result.organization.id, view);
    const colorSections = await readColorSections();

    const noun = workOrders.length === 1 ? "work order" : "work orders";
    const label = sortLabels("/work-orders", params, WORK_ORDER_SORTS, sort);
    const linkQuery = listQuery(view);
    const sortOptions = (["number", "title", "status", "due", "property", "contractor"] as const).map((key) =>
        label(SORT_NAMES[key], key),
    );
    // The search keeps the filter and sort; the filter menu keeps the search and sort.
    const keepForSearch: Record<string, string> = {
        ...(filter ? { status: filter } : {}),
        ...(sort ? { sort: sort.key, dir: sort.dir } : {}),
    };

    return (
        <main id="main" className={pageClass}>
            <PageHeader
                title="Work orders"
                subtitle={
                    query
                        ? `${workOrders.length} ${noun} matching “${query}”`
                        : `${workOrders.length} ${filter ? WORK_ORDER_FILTERS[filter].label.toLowerCase() : noun}`
                }
                actionHref="/work-orders/new"
                actionLabel="New work order"
            />

            <FilterTabs label="Filter work orders" tabs={filterOptions(filter, sort, query)} />

            <div className="mb-5 flex flex-wrap items-center gap-2">
                <SearchBox
                    label="Search work orders"
                    placeholder="Search by title, address, contractor…"
                    initial={query}
                    keep={keepForSearch}
                />
                <div className="flex items-center gap-2">
                    <nav aria-label="Filter work orders" className="md:hidden">
                        <FilterMenu options={filterOptions(filter, sort, query)} />
                    </nav>
                    <MobileSort labels={sortOptions} />
                    <ListSettings splitView={splitView} colorSections={colorSections} />
                </div>
            </div>

            {workOrders.length === 0 ? (
                query ? (
                    <EmptyState
                        icon={<SearchIcon size={22} />}
                        title="No matches"
                        message={`No work orders match “${query}”${filter ? " with this filter" : ""}. Try fewer words or another spelling.`}
                        secondary={
                            <Link
                                href={hrefWithSort("/work-orders", sort, filter ? { status: filter } : {})}
                                className={buttonClass()}
                            >
                                Clear search
                            </Link>
                        }
                    />
                ) : filter ? (
                    <EmptyState
                        icon={<ClipboardIcon size={22} />}
                        title={`No ${WORK_ORDER_FILTERS[filter].label.toLowerCase()} work orders`}
                        message="Nothing matches this filter right now."
                        secondary={
                            <Link href="/work-orders" className={buttonClass()}>
                                Show all work orders
                            </Link>
                        }
                    />
                ) : (
                    <EmptyState
                        icon={<ClipboardIcon size={22} />}
                        title="No work orders yet"
                        message="Create a work order, add the work room by room, then send your contractor a link to check items off."
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

const SORT_NAMES: Record<WorkOrderSort, string> = {
    number: "Job number",
    title: "Title",
    status: "Status",
    due: "Due date",
    property: "Property",
    contractor: "Contractor",
};

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
    const sections = STATUS_ORDER.map((status) => ({
        status,
        id: `status-${status.toLowerCase().replace("_", "-")}`,
        rows: workOrders.filter((wo) => wo.status === status),
    })).filter((section) => section.rows.length > 0);

    return (
        <>
            {/* Phones get a compact "Jump to section" menu; wide screens have the filter tabs and room to scan. */}
            <SectionMenu
                sections={sections.map(({ status, id, rows }) => ({
                    id,
                    label: WORK_ORDER_STATUS_LABELS[status],
                    count: rows.length,
                }))}
            />
            <div className="flex flex-col gap-8">
                {sections.map(({ status, id, rows }) => (
                    <CollapsibleSection
                        key={status}
                        id={id}
                        title={WORK_ORDER_STATUS_LABELS[status]}
                        count={rows.length}
                        dot={STATUS_DOTS[status]}
                        // Finished work starts folded, so the open work stays near the top.
                        defaultOpen={status !== "CLOSED" && status !== "CANCELLED"}
                    >
                        <WorkOrderList
                            workOrders={rows}
                            label={label}
                            linkQuery={linkQuery}
                            hideStatus
                            tint={colorSections ? SECTION_TINTS[status] : undefined}
                            tableLabel={`${WORK_ORDER_STATUS_LABELS[status]} work orders`}
                        />
                    </CollapsibleSection>
                ))}
            </div>
        </>
    );
}

// "All" and each filter, keeping the sort and the search. Shown as tabs on wide screens and a menu on phones.
function filterOptions(
    active: WorkOrderFilter | null,
    sort: SortState<WorkOrderSort> | null,
    query: string,
): FilterOption[] {
    const chips: { key: WorkOrderFilter | null; label: string }[] = [
        { key: null, label: "All" },
        ...(Object.keys(WORK_ORDER_FILTERS) as WorkOrderFilter[]).map((key) => ({
            key,
            label: WORK_ORDER_FILTERS[key].label,
        })),
    ];

    return chips.map((chip) => ({
        label: chip.label,
        href: hrefWithSort("/work-orders", sort, {
            ...(chip.key ? { status: chip.key } : {}),
            ...(query ? { q: query } : {}),
        }),
        active: chip.key === active,
    }));
}
