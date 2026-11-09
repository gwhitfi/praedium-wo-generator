import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { formatPhone } from "@/lib/phone";
import { CONTACT_TYPE_LABELS, PROPERTY_TYPE_LABELS } from "@/lib/defaults";
import { getWorkOrderList } from "@/lib/workOrderList";
import { matchesSearch, readQuery } from "@/lib/search";
import type { SearchParams } from "@/lib/sorting";
import PageHeader from "@/components/list/PageHeader";
import EmptyState from "@/components/list/EmptyState";
import SearchBox from "@/components/SearchBox";
import { WorkOrderList } from "@/components/WorkOrderRow";
import { Tag } from "@/components/StatusBadge";
import { ChevronRightIcon, SearchIcon } from "@/components/Icons";
import { pageClass, sectionTitleClass } from "@/lib/ui";
import { Cell, List, ListHeader, ListLink, ListRow, RowLink } from "@/components/list/List";

export const metadata: Metadata = { title: "Search" };

// The same columns as the Contacts and Properties pages.
const CONTACT_COLS = "list-wide:grid-cols-[minmax(0,1.5fr)_minmax(0,1.4fr)_9rem_minmax(0,1.6fr)]";
const PROPERTY_COLS = "list-wide:grid-cols-[minmax(0,1.4fr)_minmax(0,1.8fr)_8rem]";

// How many of each kind to show before "See all".
const LIMIT = 8;

// One search across work orders, contacts and properties, from the header's search button.
export default async function Search({ searchParams }: { searchParams: Promise<SearchParams> }) {
    const result = await getCurrentUser();
    if (result.state === "signed-out") redirect("/sign-in");
    if (result.state === "needs-org") redirect("/setup");

    const organizationId = result.organization.id;
    const query = readQuery((await searchParams).q);

    const [workOrders, contacts, properties] = query
        ? await Promise.all([
              getWorkOrderList(organizationId, { filter: null, sort: null, split: false, query }),
              prisma.contact
                  .findMany({
                      where: { organizationId, archived: false },
                      orderBy: [{ favorite: "desc" }, { displayName: "asc" }],
                      include: { unit: { include: { property: true } } },
                  })
                  .then((rows) =>
                      rows.filter((c) =>
                          matchesSearch(query, [
                              c.displayName,
                              c.firstName,
                              c.lastName,
                              c.company,
                              c.email,
                              c.phone,
                              c.unit?.property.displayName,
                          ]),
                      ),
                  ),
              prisma.property
                  .findMany({ where: { organizationId, archived: false }, orderBy: { displayName: "asc" } })
                  .then((rows) =>
                      rows.filter((p) =>
                          matchesSearch(query, [p.displayName, p.addressLine1, p.addressLine2, p.city, p.zipCode]),
                      ),
                  ),
          ])
        : [[], [], []];

    const total = workOrders.length + contacts.length + properties.length;
    const q = encodeURIComponent(query);

    return (
        <main id="main" className={pageClass}>
            <PageHeader
                title="Search"
                subtitle={
                    query
                        ? `${total} ${total === 1 ? "result" : "results"} for “${query}”`
                        : "Find work orders, contacts and properties."
                }
            />
            <div className="mb-8 [&_form]:sm:max-w-lg">
                <SearchBox
                    label="Search everything"
                    placeholder="Job number, address, contractor, tenant…"
                    initial={query}
                    autoFocus
                />
            </div>

            {!query ? (
                <EmptyState
                    icon={<SearchIcon size={22} />}
                    title="What are you looking for?"
                    message="Search by job number, title, address, unit, contractor, tenant, phone or email."
                />
            ) : total === 0 ? (
                <EmptyState
                    icon={<SearchIcon size={22} />}
                    title="No matches"
                    message={`Nothing matches “${query}”. Try fewer words, or part of a name or address. Archived records aren't searched.`}
                />
            ) : (
                <div className="flex flex-col gap-10">
                    {workOrders.length > 0 && (
                        <section aria-labelledby="search-work-orders">
                            <ResultHeading
                                id="search-work-orders"
                                title="Work orders"
                                count={workOrders.length}
                                href={workOrders.length > LIMIT ? `/work-orders?q=${q}` : undefined}
                            />
                            <WorkOrderList workOrders={workOrders.slice(0, LIMIT)} tableLabel="Matching work orders" />
                        </section>
                    )}

                    {contacts.length > 0 && (
                        <section aria-labelledby="search-contacts">
                            <ResultHeading
                                id="search-contacts"
                                title="Contacts"
                                count={contacts.length}
                                href={contacts.length > LIMIT ? `/contacts?q=${q}` : undefined}
                            />
                            {/* The same table as the Contacts page, with the type as a tag beside the name. */}
                            <List label="Matching contacts">
                                <ListHeader
                                    cols={CONTACT_COLS}
                                    labels={["Name", "Company or property", "Phone", "Email"]}
                                />
                                {contacts.slice(0, LIMIT).map((contact) => (
                                    <ListRow key={contact.id} cols={CONTACT_COLS}>
                                        <Cell className="font-medium text-foreground">
                                            <span className="flex min-w-0 flex-wrap items-center gap-2">
                                                <RowLink
                                                    href={`/contacts/${contact.id}`}
                                                    className="truncate hover:underline"
                                                >
                                                    {contact.displayName}
                                                </RowLink>
                                                <Tag>{CONTACT_TYPE_LABELS[contact.contactType]}</Tag>
                                            </span>
                                        </Cell>
                                        <Cell className="text-muted">
                                            <span className="line-clamp-1">
                                                {contact.company ?? contact.unit?.property.displayName}
                                            </span>
                                        </Cell>
                                        <Cell className="text-muted">
                                            <span className="flex min-w-0 flex-col items-start">
                                                {contact.phone && (
                                                    <ListLink href={`tel:${contact.phone}`}>
                                                        {formatPhone(contact.phone)}
                                                    </ListLink>
                                                )}
                                                {contact.email && (
                                                    <span className="min-w-0 max-w-full list-wide:hidden">
                                                        <ListLink href={`mailto:${contact.email}`}>
                                                            {contact.email}
                                                        </ListLink>
                                                    </span>
                                                )}
                                            </span>
                                        </Cell>
                                        <Cell className="text-muted list-narrow:hidden">
                                            {contact.email && (
                                                <ListLink href={`mailto:${contact.email}`}>{contact.email}</ListLink>
                                            )}
                                        </Cell>
                                    </ListRow>
                                ))}
                            </List>
                        </section>
                    )}

                    {properties.length > 0 && (
                        <section aria-labelledby="search-properties">
                            <ResultHeading
                                id="search-properties"
                                title="Properties"
                                count={properties.length}
                                href={properties.length > LIMIT ? `/properties?q=${q}` : undefined}
                            />
                            <List label="Matching properties">
                                <ListHeader cols={PROPERTY_COLS} labels={["Name", "Address", "Type"]} />
                                {properties.slice(0, LIMIT).map((property) => (
                                    <ListRow key={property.id} cols={PROPERTY_COLS}>
                                        <Cell className="font-medium text-foreground">
                                            <RowLink
                                                href={`/properties/${property.id}`}
                                                className="block truncate hover:underline"
                                            >
                                                {property.displayName}
                                            </RowLink>
                                        </Cell>
                                        <Cell className="text-muted">
                                            <span className="line-clamp-1">
                                                {property.addressLine1}, {property.city}
                                            </span>
                                        </Cell>
                                        <Cell className="text-muted">
                                            {PROPERTY_TYPE_LABELS[property.propertyType]}
                                        </Cell>
                                    </ListRow>
                                ))}
                            </List>
                        </section>
                    )}
                </div>
            )}
        </main>
    );
}

function ResultHeading({ id, title, count, href }: { id: string; title: string; count: number; href?: string }) {
    return (
        <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 id={id} className={`${sectionTitleClass} flex items-baseline gap-2`}>
                {title}
                <span className="text-sm font-normal text-subtle">{count}</span>
            </h2>
            {href && (
                <Link
                    href={href}
                    className="inline-flex items-center gap-0.5 text-sm font-medium text-accent hover:text-accent-hover"
                >
                    See all {count}
                    <ChevronRightIcon size={14} />
                </Link>
            )}
        </div>
    );
}
