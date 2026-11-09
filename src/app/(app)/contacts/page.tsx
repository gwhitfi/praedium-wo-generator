import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import prisma from "@/lib/prisma";
import { formatPhone } from "@/lib/phone";
import { unitLabel } from "@/lib/defaults";
import PageHeader from "@/components/list/PageHeader";
import EmptyState from "@/components/list/EmptyState";
import FilterTabs from "@/components/list/FilterTabs";
import FilterMenu, { type FilterOption } from "../work-orders/FilterMenu";
import { List, ListHeader, ListRow, Cell, ListLink, Favorite, MobileSort, RowLink } from "@/components/list/List";
import SearchBox from "@/components/SearchBox";
import { CollapsibleSection } from "@/components/list/Sections";
import { Tag } from "@/components/StatusBadge";
import { SearchIcon, UsersIcon } from "@/components/Icons";
import { matchesSearch, readQuery } from "@/lib/search";
import { buttonClass, pageClass } from "@/lib/ui";
import {
    contactSortName,
    hrefWithSort,
    parseSort,
    sortLabels,
    sortRows,
    type SearchParams,
    type SortColumns,
} from "@/lib/sorting";

export const metadata: Metadata = { title: "Contacts" };

// The type filters, by their `type` URL value. Archived is a separate tab (`archived=1`) covering every type.
const TYPE_FILTERS = {
    contractors: { type: "CONTRACTOR", label: "Contractors" },
    tenants: { type: "TENANT", label: "Tenants" },
    other: { type: "OTHER", label: "Other" },
} as const;
type TypeFilter = keyof typeof TYPE_FILTERS;

function readTypeFilter(value: string | string[] | undefined): TypeFilter | null {
    return typeof value === "string" && value in TYPE_FILTERS ? (value as TypeFilter) : null;
}

const COLS = "list-wide:grid-cols-[minmax(0,1.5fr)_minmax(0,1.4fr)_9rem_minmax(0,1.6fr)]";

type SortableContact = {
    contactType: string;
    displayName: string;
    firstName: string | null;
    lastName: string | null;
    company: string | null;
    phone: string | null;
    email: string | null;
    unit: { name: string; isDefault: boolean; property: { displayName: string } } | null;
};

// "detail" is the second column: the company for contractors, the property and unit for tenants.
// The Other section's Notes column isn't sortable.
const SORTS: SortColumns<SortableContact, "name" | "detail" | "phone" | "email"> = {
    name: { value: contactSortName },
    detail: {
        value: (c) => {
            if (c.contactType === "CONTRACTOR") return c.company;
            if (c.contactType === "TENANT" && c.unit) {
                return [c.unit.property.displayName, c.unit.isDefault ? null : c.unit.name];
            }
            return null;
        },
    },
    phone: { value: (c) => c.phone },
    email: { value: (c) => c.email },
};

export default async function Contacts({ searchParams }: { searchParams: Promise<SearchParams> }) {
    const result = await getCurrentUser();

    if (result.state === "signed-out") {
        redirect("/sign-in");
    }

    if (result.state === "needs-org") {
        redirect("/setup");
    }

    const params = await searchParams;
    const showArchived = params.archived === "1";
    const typeFilter = showArchived ? null : readTypeFilter(params.type);
    const query = readQuery(params.q);
    const sort = parseSort(params, SORTS);
    const label = sortLabels("/contacts", params, SORTS, sort);

    const allContacts = await prisma.contact.findMany({
        where: {
            organizationId: result.organization.id,
            archived: showArchived,
        },
        orderBy: [{ favorite: "desc" }, { displayName: "asc" }],
        include: {
            unit: {
                include: { property: true },
            },
        },
    });

    const ofType = typeFilter
        ? allContacts.filter((c) => c.contactType === TYPE_FILTERS[typeFilter].type)
        : allContacts;
    const contacts = query
        ? ofType.filter((c) =>
              matchesSearch(query, [
                  c.displayName,
                  c.firstName,
                  c.lastName,
                  c.company,
                  c.email,
                  c.phone,
                  c.unit?.property.displayName,
                  c.unit?.name,
              ]),
          )
        : ofType;

    type ContactRow = (typeof contacts)[number];

    const sortedContacts = sortRows(contacts, SORTS, sort);

    const sections: {
        type: ContactRow["contactType"];
        title: string;
        empty: string;
        detailLabel: string;
        detailSortable: boolean;
        detail: (c: ContactRow) => ReactNode;
    }[] = [
        {
            type: "CONTRACTOR",
            title: "Contractors",
            empty: "No contractors yet. Add the people and companies you send work to.",
            detailLabel: "Company",
            detailSortable: true,
            detail: (c) => c.company,
        },
        {
            type: "TENANT",
            title: "Tenants",
            empty: "No tenants yet. Add them so work orders can show who lives there.",
            detailLabel: "Property",
            detailSortable: true,
            detail: (c) =>
                c.unit && `${c.unit.property.displayName}${c.unit.isDefault ? "" : ` · ${unitLabel(c.unit.name)}`}`,
        },
        {
            type: "OTHER",
            title: "Other",
            empty: "No other contacts.",
            detailLabel: "Notes",
            detailSortable: false,
            detail: (c) => c.notes,
        },
    ];

    // With a type chosen, only that type's section is shown.
    const shownSections = typeFilter ? sections.filter((s) => s.type === TYPE_FILTERS[typeFilter].type) : sections;
    const filterParams: Record<string, string> = showArchived
        ? { archived: "1" }
        : typeFilter
          ? { type: typeFilter }
          : {};
    const keep: Record<string, string> = {
        ...filterParams,
        ...(sort ? { sort: sort.key, dir: sort.dir } : {}),
    };
    const tabs = filterTabs(showArchived, typeFilter, sort, query);
    const noun = contacts.length === 1 ? "contact" : "contacts";

    return (
        <main id="main" className={pageClass}>
            <PageHeader
                title="Contacts"
                subtitle={
                    query
                        ? `${contacts.length} ${noun} matching “${query}”`
                        : `${contacts.length} ${showArchived ? "archived " : ""}${noun}`
                }
                actionHref="/contacts/new"
                actionLabel="New contact"
            />

            <FilterTabs label="Filter contacts" tabs={tabs} />

            <div className="mb-5 flex flex-wrap items-center gap-2">
                <SearchBox
                    label="Search contacts"
                    placeholder="Search by name, company, phone…"
                    initial={query}
                    keep={keep}
                />
                <div className="flex items-center gap-2">
                    <nav aria-label="Filter contacts" className="md:hidden">
                        <FilterMenu options={tabs} />
                    </nav>
                    <MobileSort
                        labels={[label("Name", "name"), label("Company or property", "detail"), label("Phone", "phone"), label("Email", "email")]}
                    />
                </div>
            </div>

            {/* With a type chosen and no search, an empty result shows that section's own empty message below. */}
            {contacts.length === 0 && (query || !typeFilter) ? (
                query ? (
                    <EmptyState
                        icon={<SearchIcon size={22} />}
                        title="No matches"
                        message={`No ${showArchived ? "archived " : typeFilter ? `${TYPE_FILTERS[typeFilter].label.toLowerCase()} ` : ""}contacts match “${query}”.`}
                        secondary={
                            <Link
                                href={hrefWithSort("/contacts", sort, filterParams)}
                                className={buttonClass()}
                            >
                                Clear search
                            </Link>
                        }
                    />
                ) : showArchived ? (
                    <EmptyState
                        icon={<UsersIcon size={22} />}
                        title="No archived contacts"
                        message="Contacts you archive are kept here with their history."
                    />
                ) : (
                    <EmptyState
                        icon={<UsersIcon size={22} />}
                        title="No contacts yet"
                        message="Add your contractors to send them work orders, and your tenants so work orders show who lives there."
                        actionHref="/contacts/new"
                        actionLabel="Add your first contact"
                    />
                )
            ) : (
                <div className="flex flex-col gap-8">
                    {shownSections.map((section) => {
                        const rows = sortedContacts.filter((c) => c.contactType === section.type);
                        if (rows.length === 0 && (query || showArchived)) return null;

                        return (
                            <CollapsibleSection
                                key={section.type}
                                id={`contacts-${section.type.toLowerCase()}`}
                                title={section.title}
                                count={rows.length}
                            >
                                {rows.length === 0 ? (
                                    <EmptyState
                                        compact
                                        message={section.empty}
                                        actionHref={section.type === "OTHER" ? undefined : "/contacts/new"}
                                        actionLabel="Add contact"
                                    />
                                ) : (
                                    <List label={section.title}>
                                        <ListHeader
                                            cols={COLS}
                                            labels={[
                                                label("Name", "name"),
                                                section.detailSortable
                                                    ? label(section.detailLabel, "detail")
                                                    : section.detailLabel,
                                                label("Phone", "phone"),
                                                label("Email", "email"),
                                            ]}
                                        />
                                        {rows.map((contact) => (
                                            <ListRow key={contact.id} cols={COLS}>
                                                <Cell className="font-medium text-foreground">
                                                    <span className="flex min-w-0 items-center gap-2">
                                                        <RowLink
                                                            href={`/contacts/${contact.id}`}
                                                            className="truncate hover:underline"
                                                        >
                                                            {contact.displayName}
                                                        </RowLink>
                                                        <Favorite show={contact.favorite} />
                                                        {contact.inHouse && <Tag>In-house</Tag>}
                                                    </span>
                                                </Cell>
                                                <Cell className="text-muted">
                                                    <span className="line-clamp-1">{section.detail(contact)}</span>
                                                </Cell>
                                                {/* As a card, the phone and email stack in this cell. */}
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
                                                        <ListLink href={`mailto:${contact.email}`}>
                                                            {contact.email}
                                                        </ListLink>
                                                    )}
                                                </Cell>
                                            </ListRow>
                                        ))}
                                    </List>
                                )}
                            </CollapsibleSection>
                        );
                    })}
                </div>
            )}
        </main>
    );
}

// The filter tabs (FilterMenu on phones): All, each type, then Archived. Switching keeps the sort and search.
function filterTabs(
    showArchived: boolean,
    typeFilter: TypeFilter | null,
    sort: Parameters<typeof hrefWithSort>[1],
    query: string,
): FilterOption[] {
    const q: Record<string, string> = query ? { q: query } : {};
    return [
        { label: "All", href: hrefWithSort("/contacts", sort, q), active: !showArchived && !typeFilter },
        ...(Object.keys(TYPE_FILTERS) as TypeFilter[]).map((key) => ({
            label: TYPE_FILTERS[key].label,
            href: hrefWithSort("/contacts", sort, { type: key, ...q }),
            active: typeFilter === key,
        })),
        { label: "Archived", href: hrefWithSort("/contacts", sort, { archived: "1", ...q }), active: showArchived },
    ];
}
