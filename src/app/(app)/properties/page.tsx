import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import prisma from "@/lib/prisma";
import { PROPERTY_TYPE_LABELS } from "@/lib/defaults";
import PageHeader from "@/components/list/PageHeader";
import EmptyState from "@/components/list/EmptyState";
import FilterTabs from "@/components/list/FilterTabs";
import { List, ListHeader, ListRow, Cell, Favorite, MobileSort, RowLink } from "@/components/list/List";
import SearchBox from "@/components/SearchBox";
import { CollapsibleSection } from "@/components/list/Sections";
import { BuildingIcon, SearchIcon } from "@/components/Icons";
import { matchesSearch, readQuery } from "@/lib/search";
import { badgeClass, buttonClass, pageClass } from "@/lib/ui";
import {
    hrefWithSort,
    parseSort,
    sortLabels,
    sortRows,
    streetSortKey,
    type SearchParams,
    type SortColumns,
    type SortLabel,
} from "@/lib/sorting";
import FilterMenu, { type FilterOption } from "../work-orders/FilterMenu";
import PropertyListSettings from "./PropertyListSettings";
import { GROUP_BY_TYPE_COOKIE } from "./schemas";

export const metadata: Metadata = { title: "Properties" };

const COLS = "list-wide:grid-cols-[minmax(0,1.4fr)_minmax(0,1.8fr)_7rem_5rem_7rem]";
// Inside a "Group by type" section the type is the heading, so its column is left out.
const COLS_NO_TYPE = "list-wide:grid-cols-[minmax(0,1.4fr)_minmax(0,1.8fr)_5rem_7rem]";
const TYPE_COLUMN = 2;

type PropertyRow = {
    displayName: string;
    addressLine1: string;
    propertyType: string;
    _count: { units: number; workOrders: number };
};

const SORTS: SortColumns<PropertyRow, "name" | "address" | "type" | "units" | "open"> = {
    name: { value: (p) => p.displayName },
    address: { value: (p) => streetSortKey(p.addressLine1) },
    type: { value: (p) => PROPERTY_TYPE_LABELS[p.propertyType] },
    units: { value: (p) => p._count.units, firstDir: "desc" },
    open: { value: (p) => p._count.workOrders, firstDir: "desc" },
};

const isPropertyType = (value: unknown): value is string =>
    typeof value === "string" && Object.hasOwn(PROPERTY_TYPE_LABELS, value);

export default async function Properties({ searchParams }: { searchParams: Promise<SearchParams> }) {
    const result = await getCurrentUser();

    if (result.state === "signed-out") {
        redirect("/sign-in");
    }

    if (result.state === "needs-org") {
        redirect("/setup");
    }

    const params = await searchParams;
    const showArchived = params.archived === "1";
    const query = readQuery(params.q);
    // Archived is its own tab, covering every type.
    const type = !showArchived && isPropertyType(params.type) ? params.type : null;
    const sort = parseSort(params, SORTS);
    const label = sortLabels("/properties", params, SORTS, sort);
    const groupByType = (await cookies()).get(GROUP_BY_TYPE_COOKIE)?.value === "1";

    const [allProperties, activeTypes] = await Promise.all([
        prisma.property.findMany({
            where: {
                organizationId: result.organization.id,
                archived: showArchived,
            },
            orderBy: [{ favorite: "desc" }, { displayName: "asc" }],
            include: {
                _count: {
                    select: {
                        units: { where: { archived: false } },
                        workOrders: {
                            where: { archived: false, status: { in: ["DRAFT", "SENT", "IN_PROGRESS"] } },
                        },
                    },
                },
            },
        }),
        // The active properties' types, for the type tabs, which stay the same on the Archived tab.
        prisma.property.groupBy({
            by: ["propertyType"],
            where: { organizationId: result.organization.id, archived: false },
        }),
    ]);

    // The types in the usual order: the shown properties' for the groups, the active ones' for the tabs.
    const typesInUse = Object.keys(PROPERTY_TYPE_LABELS).filter((key) =>
        allProperties.some((p) => p.propertyType === key),
    );
    const tabTypes = Object.keys(PROPERTY_TYPE_LABELS).filter((key) =>
        activeTypes.some((t) => t.propertyType === key),
    );

    const properties = sortRows(
        allProperties.filter(
            (p) =>
                (!type || p.propertyType === type) &&
                (!query ||
                    matchesSearch(query, [
                        p.displayName,
                        p.addressLine1,
                        p.addressLine2,
                        p.city,
                        p.zipCode,
                        PROPERTY_TYPE_LABELS[p.propertyType],
                    ])),
        ),
        SORTS,
        sort,
    );

    // Every link on the page keeps the other choices: archived, type, search and sort.
    const link = (changes: { archived?: boolean; type?: string | null; q?: string }) => {
        const archived = changes.archived ?? showArchived;
        const nextType = changes.type === undefined ? type : changes.type;
        const nextQuery = changes.q ?? query;
        return hrefWithSort("/properties", sort, {
            ...(archived ? { archived: "1" } : {}),
            ...(nextType ? { type: nextType } : {}),
            ...(nextQuery ? { q: nextQuery } : {}),
        });
    };

    const keep: Record<string, string> = {
        ...(showArchived ? { archived: "1" } : {}),
        ...(type ? { type } : {}),
        ...(sort ? { sort: sort.key, dir: sort.dir } : {}),
    };
    const noun = properties.length === 1 ? "property" : "properties";
    const labels = [
        label("Name", "name"),
        label("Address", "address"),
        label("Type", "type"),
        label("Units", "units"),
        label("Open work", "open"),
    ];
    const typeName = type ? PROPERTY_TYPE_LABELS[type].toLowerCase() : null;
    // All, a tab per type (when there's more than one), then Archived; FilterMenu on phones.
    const tabs: FilterOption[] = [
        { label: "All", href: link({ archived: false, type: null }), active: !showArchived && !type },
        ...(tabTypes.length > 1
            ? tabTypes.map((key) => ({
                  label: pluralType(key),
                  href: link({ archived: false, type: key }),
                  active: type === key,
              }))
            : []),
        { label: "Archived", href: link({ archived: true, type: null }), active: showArchived },
    ];

    return (
        <main id="main" className={pageClass}>
            <PageHeader
                title="Properties"
                subtitle={
                    query
                        ? `${properties.length} ${noun} matching “${query}”`
                        : `${properties.length} ${showArchived ? "archived " : ""}${typeName ? `${typeName} ` : ""}${noun}`
                }
                actionHref="/properties/new"
                actionLabel="New property"
            />

            <FilterTabs label="Filter properties" tabs={tabs} />

            <div className="mb-5 flex flex-wrap items-center gap-2">
                <SearchBox
                    label="Search properties"
                    placeholder="Search by name, address, city…"
                    initial={query}
                    keep={keep}
                />
                <div className="flex items-center gap-2">
                    <nav aria-label="Filter properties" className="md:hidden">
                        <FilterMenu options={tabs} />
                    </nav>
                    <MobileSort labels={labels} />
                    <PropertyListSettings groupByType={groupByType} />
                </div>
            </div>

            {properties.length === 0 ? (
                query || type ? (
                    <EmptyState
                        icon={<SearchIcon size={22} />}
                        title="No matches"
                        message={`No ${showArchived ? "archived " : ""}${typeName ? `${typeName} ` : ""}properties${query ? ` match “${query}”` : " yet"}.`}
                        secondary={
                            <Link href={link({ q: "", type: null })} className={buttonClass()}>
                                Clear filters
                            </Link>
                        }
                    />
                ) : showArchived ? (
                    <EmptyState
                        icon={<BuildingIcon size={22} />}
                        title="No archived properties"
                        message="Properties you archive are kept here with their history."
                    />
                ) : (
                    <EmptyState
                        icon={<BuildingIcon size={22} />}
                        title="No properties yet"
                        message="Add the buildings you manage, with their units, so work orders know where the work is."
                        actionHref="/properties/new"
                        actionLabel="Add your first property"
                    />
                )
            ) : groupByType && !type ? (
                <>
                    <div className="flex flex-col gap-8">
                        {typesInUse.map((key) => {
                            const rows = properties.filter((p) => p.propertyType === key);
                            if (rows.length === 0) return null;
                            return (
                                <CollapsibleSection
                                    key={key}
                                    id={`type-${key.toLowerCase()}`}
                                    title={pluralType(key)}
                                    count={rows.length}
                                >
                                    <PropertyTable
                                        rows={rows}
                                        labels={labels.filter((_, i) => i !== TYPE_COLUMN)}
                                        tableLabel={pluralType(key)}
                                        hideType
                                    />
                                </CollapsibleSection>
                            );
                        })}
                    </div>
                </>
            ) : (
                <PropertyTable rows={properties} labels={labels} tableLabel="Properties" />
            )}
        </main>
    );
}

// "Houses", "Duplexes", "Land" for the group headings.
function pluralType(key: string): string {
    const name = PROPERTY_TYPE_LABELS[key];
    if (key === "LAND" || key === "COMMERCIAL") return name;
    return name.endsWith("x") ? `${name}es` : `${name}s`;
}

type PropertyListRow = PropertyRow & {
    id: string;
    favorite: boolean;
    city: string;
    state: string;
    zipCode: string;
};

function PropertyTable({
    rows,
    labels,
    tableLabel,
    hideType = false,
}: {
    rows: PropertyListRow[];
    labels: (string | SortLabel)[];
    tableLabel: string;
    hideType?: boolean;
}) {
    const cols = hideType ? COLS_NO_TYPE : COLS;
    return (
        <List label={tableLabel}>
            <ListHeader cols={cols} labels={labels} />
            {rows.map((property) => (
                <ListRow key={property.id} cols={cols}>
                    <Cell className="font-medium text-foreground">
                        <span className="flex min-w-0 items-center">
                            <RowLink href={`/properties/${property.id}`} className="truncate hover:underline">
                                {property.displayName}
                            </RowLink>
                            <Favorite show={property.favorite} />
                        </span>
                    </Cell>
                    <Cell className="text-muted">
                        <p className="truncate">{property.addressLine1}</p>
                        <p className="truncate text-[0.8125rem] text-muted">
                            {property.city}, {property.state} {property.zipCode}
                        </p>
                    </Cell>
                    {hideType ? (
                        property._count.units > 1 && (
                            <Cell className="text-muted list-wide:hidden">{property._count.units} units</Cell>
                        )
                    ) : (
                        <Cell className="text-muted">
                            <span className="list-wide:hidden">
                                {PROPERTY_TYPE_LABELS[property.propertyType]}
                                {property._count.units > 1 && ` · ${property._count.units} units`}
                            </span>
                            <span className="list-narrow:hidden">{PROPERTY_TYPE_LABELS[property.propertyType]}</span>
                        </Cell>
                    )}
                    <Cell className="tabular-nums text-muted list-narrow:hidden">
                        {property._count.units > 1 ? property._count.units : "—"}
                    </Cell>
                    <Cell>
                        {property._count.workOrders > 0 ? (
                            <span className={`${badgeClass} border-line-strong text-secondary`}>
                                {property._count.workOrders} open
                            </span>
                        ) : (
                            <span className="text-subtle list-narrow:hidden">None</span>
                        )}
                    </Cell>
                </ListRow>
            ))}
        </List>
    );
}
