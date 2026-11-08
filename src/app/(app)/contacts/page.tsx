import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import prisma from "@/lib/prisma";
import { formatPhone } from "@/lib/phone";
import { unitLabel } from "@/lib/defaults";
import PageHeader from "@/components/list/PageHeader";
import EmptyState from "@/components/list/EmptyState";
import { List, ListHeader, ListRow, Cell, ListLink, Favorite } from "@/components/list/List";
import {
    contactSortName,
    hrefWithSort,
    parseSort,
    sortLabels,
    sortRows,
    type SearchParams,
    type SortColumns,
} from "@/lib/sorting";

const COLS = "sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.5fr)]";

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
    const sort = parseSort(params, SORTS);
    const label = sortLabels("/contacts", params, SORTS, sort);

    const contacts = await prisma.contact.findMany({
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
            empty: "No contractors yet.",
            detailLabel: "Company",
            detailSortable: true,
            detail: (c) => c.company,
        },
        {
            type: "TENANT",
            title: "Tenants",
            empty: "No tenants yet.",
            detailLabel: "Property",
            detailSortable: true,
            detail: (c) =>
                c.unit && `${c.unit.property.displayName}${c.unit.isDefault ? "" : ` · ${unitLabel(c.unit.name)}`}`,
        },
        {
            type: "OTHER",
            title: "Other",
            empty: "No other contacts yet.",
            detailLabel: "Notes",
            detailSortable: false,
            detail: (c) => c.notes,
        },
    ];

    return (
        <main className="mx-auto max-w-5xl px-4 py-10 text-foreground">
            <PageHeader
                title="Contacts"
                subtitle={`${contacts.length} ${showArchived ? "archived " : ""}${contacts.length === 1 ? "contact" : "contacts"}`}
                actionHref="/contacts/new"
                actionLabel="New contact"
            />

            <div className="-mt-4 mb-4 flex justify-end">
                <Link
                    href={hrefWithSort("/contacts", sort, showArchived ? {} : { archived: "1" })}
                    className="text-sm text-subtle hover:text-foreground"
                >
                    {showArchived ? "← Show active" : "Show archived"}
                </Link>
            </div>

            {contacts.length === 0 && showArchived ? (
                <p className="rounded-lg border border-dashed border-line px-4 py-4 text-sm text-subtle">
                    No archived contacts.
                </p>
            ) : contacts.length === 0 ? (
                <EmptyState
                    message="No contacts added yet."
                    actionHref="/contacts/new"
                    actionLabel="Add your first contact"
                />
            ) : (
                <div className="flex flex-col gap-8">
                    {sections.map((section) => {
                        const rows = sortedContacts.filter((c) => c.contactType === section.type);

                        return (
                            <section key={section.type}>
                                <h2 className="mb-3 flex items-baseline gap-2 text-lg font-semibold">
                                    {section.title}
                                    <span className="text-sm font-normal text-subtle">{rows.length}</span>
                                </h2>

                                {rows.length === 0 ? (
                                    <p className="rounded-lg border border-dashed border-line px-4 py-4 text-sm text-subtle">
                                        {section.empty}
                                    </p>
                                ) : (
                                    <List>
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
                                            <ListRow
                                                key={contact.id}
                                                href={`/contacts/${contact.id}`}
                                                label={`View ${contact.displayName}`}
                                                cols={COLS}
                                            >
                                                <Cell className="basis-full truncate font-medium text-foreground">
                                                    {contact.displayName}
                                                    <Favorite show={contact.favorite} />
                                                    {contact.inHouse && (
                                                        <span className="ml-2 rounded-full border border-line-strong px-1.5 py-0.5 text-xs font-normal text-muted">
                                                            In-house
                                                        </span>
                                                    )}
                                                </Cell>
                                                <Cell className="basis-full truncate text-muted">
                                                    {section.detail(contact)}
                                                </Cell>
                                                <Cell className="text-muted">
                                                    {contact.phone && (
                                                        <ListLink href={`tel:${contact.phone}`}>
                                                            {formatPhone(contact.phone)}
                                                        </ListLink>
                                                    )}
                                                </Cell>
                                                <Cell className="text-muted">
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
                            </section>
                        );
                    })}
                </div>
            )}
        </main>
    );
}
