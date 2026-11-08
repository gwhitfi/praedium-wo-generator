import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/prisma";
import { PROPERTY_TYPE_LABELS } from "@/lib/defaults";
import PageHeader from "@/components/list/PageHeader";
import EmptyState from "@/components/list/EmptyState";
import { List, ListHeader, ListRow, Cell, Favorite } from "@/components/list/List";
import {
    hrefWithSort,
    parseSort,
    sortLabels,
    sortRows,
    streetSortKey,
    type SearchParams,
    type SortColumns,
} from "@/lib/sorting";

const COLS = "sm:grid-cols-[minmax(0,1.5fr)_minmax(0,2fr)_minmax(0,1fr)_minmax(0,0.7fr)_minmax(0,0.8fr)]";

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
    const sort = parseSort(params, SORTS);
    const label = sortLabels("/properties", params, SORTS, sort);

    const properties = await prisma.property.findMany({
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
    });

    return (
        <main className="mx-auto max-w-5xl px-4 py-10 text-foreground">
            <PageHeader
                title="Properties"
                subtitle={`${properties.length} ${showArchived ? "archived " : ""}${properties.length === 1 ? "property" : "properties"}`}
                actionHref="/properties/new"
                actionLabel="New property"
            />

            <div className="-mt-4 mb-4 flex justify-end">
                <Link
                    href={hrefWithSort("/properties", sort, showArchived ? {} : { archived: "1" })}
                    className="text-sm text-subtle hover:text-foreground"
                >
                    {showArchived ? "← Show active" : "Show archived"}
                </Link>
            </div>

            {properties.length === 0 && showArchived ? (
                <p className="rounded-lg border border-dashed border-line px-4 py-4 text-sm text-subtle">
                    No archived properties.
                </p>
            ) : properties.length === 0 ? (
                <EmptyState
                    message="No properties added yet."
                    actionHref="/properties/new"
                    actionLabel="Add your first property"
                />
            ) : (
                <List>
                    <ListHeader
                        cols={COLS}
                        labels={[
                            label("Name", "name"),
                            label("Address", "address"),
                            label("Type", "type"),
                            label("Units", "units"),
                            label("Open work", "open"),
                        ]}
                    />
                    {sortRows(properties, SORTS, sort).map((property) => (
                        <ListRow
                            key={property.id}
                            href={`/properties/${property.id}`}
                            label={`View ${property.displayName}`}
                            cols={COLS}
                        >
                            <Cell className="basis-full truncate font-medium text-foreground">
                                {property.displayName}
                                <Favorite show={property.favorite} />
                            </Cell>
                            <Cell className="basis-full text-muted">
                                <p className="truncate">{property.addressLine1}</p>
                                <p className="truncate text-xs text-subtle">
                                    {property.city}, {property.state} {property.zipCode}
                                </p>
                            </Cell>
                            <Cell className="text-muted">{PROPERTY_TYPE_LABELS[property.propertyType]}</Cell>
                            <Cell className="text-muted">
                                {property._count.units > 1 && `${property._count.units} units`}
                            </Cell>
                            <Cell>
                                {property._count.workOrders > 0 && (
                                    <span className="rounded-full border border-warning/50 px-2 py-0.5 text-xs text-warning">
                                        {property._count.workOrders} open
                                    </span>
                                )}
                            </Cell>
                        </ListRow>
                    ))}
                </List>
            )}
        </main>
    );
}
