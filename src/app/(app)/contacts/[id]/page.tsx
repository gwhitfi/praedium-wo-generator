import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { CONTACT_TYPE_LABELS, unitLabel } from "@/lib/defaults";
import prisma from "@/lib/prisma";
import { formatPhone } from "@/lib/phone";
import { OPEN_STATUSES } from "@/lib/workOrders";
import { notFound, redirect } from "next/navigation";
import PageHeader from "@/components/list/PageHeader";
import EmptyState from "@/components/list/EmptyState";
import TitleWithFavorite from "@/components/TitleWithFavorite";
import { WorkOrderList } from "@/components/WorkOrderRow";
import DeleteButton from "@/components/DeleteButton";
import DetailList, { ContactLine, type Detail } from "@/components/DetailList";
import DangerZone, { DangerRow } from "@/components/DangerZone";
import { ButtonLink } from "@/components/Button";
import { Tag } from "@/components/StatusBadge";
import { PencilIcon, PlusIcon } from "@/components/Icons";
import { cardClass, cardTitleClass, noticeClass, pageClass, sectionTitleClass } from "@/lib/ui";
import { deleteContact, toggleContactFavorite } from "../actions";
import { ArchiveContactButton, RestoreContactButton } from "./ArchiveContact";
import { SignOutDevicesButton } from "./SignOutDevices";

export const metadata: Metadata = { title: "Contact" };

export default async function ContactDetail({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const result = await getCurrentUser();

    if (result.state === "signed-out") {
        redirect("/sign-in");
    }

    if (result.state === "needs-org") {
        redirect("/setup");
    }

    const organizationId = result.organization.id;

    const contact = await prisma.contact.findFirst({
        where: {
            id,
            organizationId,
        },
        include: {
            unit: {
                include: { property: true },
            },
        },
    });
    if (!contact) {
        notFound();
    }

    const isTenant = contact.contactType === "TENANT";
    const workOrderWhere = { organizationId, archived: false, ...(isTenant ? { tenantId: id } : { contractorId: id }) };

    const [workOrders, workOrderCount, openCount] = await Promise.all([
        prisma.workOrder.findMany({
            where: workOrderWhere,
            orderBy: { createdAt: "desc" },
            take: 50,
            include: { property: true, unit: true },
        }),
        prisma.workOrder.count({ where: workOrderWhere }),
        prisma.workOrder.count({ where: { ...workOrderWhere, status: { in: OPEN_STATUSES } } }),
    ]);

    // Open work first, newest first within each group.
    const isOpen = (status: (typeof workOrders)[number]["status"]) => OPEN_STATUSES.includes(status);
    const shownWorkOrders = [
        ...workOrders.filter((wo) => isOpen(wo.status)),
        ...workOrders.filter((wo) => !isOpen(wo.status)),
    ].slice(0, 10);

    // Sign-out needs a work order this organization has sent the contractor (see signOutContractorDevices).
    const showAccess =
        !isTenant &&
        !!contact.email &&
        (await prisma.workOrder.count({ where: { organizationId, contractorId: id, sentAt: { not: null } } })) > 0;

    const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
    const property = contact.unit?.property;
    const canDelete = isTenant || openCount === 0;

    const details: Detail[] = [
        {
            label: "Phone",
            value: contact.phone ? (
                <ContactLine href={`tel:${contact.phone}`}>{formatPhone(contact.phone)}</ContactLine>
            ) : (
                "No phone"
            ),
            empty: !contact.phone,
        },
        {
            label: "Email",
            value: contact.email ? (
                <ContactLine href={`mailto:${contact.email}`}>{contact.email}</ContactLine>
            ) : (
                "No email"
            ),
            empty: !contact.email,
        },
        ...(fullName && fullName !== contact.displayName ? [{ label: "Name", value: fullName }] : []),
        ...(isTenant
            ? [
                  {
                      label: "Lives at",
                      value: property ? property.displayName : "Not linked to a property",
                      href: property ? `/properties/${property.id}` : undefined,
                      empty: !property,
                      extra: contact.unit && !contact.unit.isDefault ? unitLabel(contact.unit.name) : undefined,
                  },
              ]
            : [
                  ...(contact.company && contact.company !== contact.displayName
                      ? [{ label: "Company", value: contact.company }]
                      : []),
                  {
                      label: "Address",
                      value: contact.addressLine1 ?? "No address on file",
                      empty: !contact.addressLine1,
                      extra: (contact.addressLine2 || contact.city) && (
                          <>
                              {contact.addressLine2 && <p>{contact.addressLine2}</p>}
                              {contact.city && (
                                  <p>
                                      {contact.city}, {contact.state} {contact.zipCode}
                                  </p>
                              )}
                          </>
                      ),
                  },
              ]),
    ];

    return (
        <main id="main" className={pageClass}>
            {contact.archived && (
                <div className={`${noticeClass.info} mb-6 flex flex-wrap items-center justify-between gap-3`}>
                    <p>This contact is archived. It&apos;s hidden from lists and can&apos;t be picked for new work.</p>
                    <RestoreContactButton contactId={contact.id} />
                </div>
            )}

            <PageHeader
                back={{ href: "/contacts", label: "Contacts" }}
                eyebrow={
                    <>
                        <Tag>{CONTACT_TYPE_LABELS[contact.contactType]}</Tag>
                        {contact.inHouse && <Tag>In-house</Tag>}
                    </>
                }
                title={
                    <TitleWithFavorite
                        name={contact.displayName}
                        favorite={contact.favorite}
                        archived={contact.archived}
                        onToggle={toggleContactFavorite.bind(null, contact.id)}
                    />
                }
                subtitle={`${openCount} open · ${workOrderCount} ${workOrderCount === 1 ? "work order" : "work orders"} in total`}
                actions={
                    !contact.archived && (
                        <>
                            <ButtonLink href={`/contacts/${contact.id}/edit`} size="sm" aria-label="Edit contact">
                                <PencilIcon size={14} />
                                Edit
                            </ButtonLink>
                            {/* Start a job for this contractor (or other contact) right from their page. */}
                            {contact.contactType !== "TENANT" && (
                                <ButtonLink
                                    href={`/work-orders/new?contractorId=${contact.id}`}
                                    size="sm"
                                    variant="primary"
                                    aria-label={`New work order for ${contact.displayName}`}
                                >
                                    <PlusIcon />
                                    New work order
                                </ButtonLink>
                            )}
                        </>
                    )
                }
            />

            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-8">
                <aside
                    className="flex flex-col gap-4 lg:col-start-2 lg:row-start-1 max-lg:order-1"
                    aria-label="Contact details"
                >
                    <DetailList title="Details" details={details} />
                    {contact.notes && (
                        <section aria-label="Notes" className={`${cardClass} p-4 sm:p-5`}>
                            <p className={cardTitleClass}>Notes</p>
                            <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-secondary">
                                {contact.notes}
                            </p>
                        </section>
                    )}
                    {showAccess && (
                        <section aria-labelledby="access-title" className={`${cardClass} p-4 sm:p-5`}>
                            <h2 id="access-title" className={cardTitleClass}>
                                Contractor access
                            </h2>
                            <p className="mt-1.5 mb-3 text-sm text-muted">
                                They verify once by email and stay signed in on that device for 30 days.
                            </p>
                            <SignOutDevicesButton contactId={contact.id} />
                        </section>
                    )}
                </aside>

                {/* On phones this column's sections join the page grid, so the details (order 1) come after the
                    work orders and before the archive and delete section (order 2). */}
                <div className="min-w-0 lg:col-start-1 lg:row-start-1 max-lg:contents">
                    <section aria-labelledby="contact-work-title">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                            <h2 id="contact-work-title" className={sectionTitleClass}>
                                Work orders
                            </h2>
                            {!contact.archived && isTenant && property && !property.archived && (
                                <ButtonLink href={`/work-orders/new?propertyId=${property.id}`} size="sm">
                                    <PlusIcon />
                                    New work order
                                </ButtonLink>
                            )}
                        </div>
                        {shownWorkOrders.length === 0 ? (
                            <EmptyState
                                compact
                                message={
                                    isTenant
                                        ? "No work orders for this tenant's home yet."
                                        : "Nothing sent to this contact yet. Pick them as the contractor on a work order."
                                }
                            />
                        ) : (
                            <>
                                <WorkOrderList workOrders={shownWorkOrders} hideContractor={!isTenant} />
                                {workOrderCount > shownWorkOrders.length && (
                                    <p className="mt-2 text-sm text-subtle">
                                        Showing {shownWorkOrders.length} of {workOrderCount}, open work first.
                                    </p>
                                )}
                            </>
                        )}
                    </section>

                    <DangerZone className="max-lg:order-2 max-lg:mt-4">
                        {!contact.archived && (
                            <DangerRow
                                title="Archive"
                                description="Hide them from lists and new work orders. Past work orders keep their details."
                            >
                                <ArchiveContactButton
                                    contactId={contact.id}
                                    contactName={contact.displayName}
                                    openCount={isTenant ? 0 : openCount}
                                    isTenant={isTenant}
                                />
                            </DangerRow>
                        )}
                        <DangerRow
                            title="Delete permanently"
                            description={
                                canDelete
                                    ? "Removes the contact. Work orders keep the name, phone and email saved on them."
                                    : "Close, cancel or reassign their open work orders before deleting."
                            }
                        >
                            {canDelete && (
                                <DeleteButton
                                    itemName={contact.displayName}
                                    onDelete={deleteContact.bind(null, contact.id)}
                                >
                                    <p>
                                        Their work orders stay, keeping the name, phone and email saved on them, but
                                        will no longer link to this contact.
                                    </p>
                                    {!contact.archived && (
                                        <p className="text-muted">
                                            To keep them in your records, go back and use <strong>Archive</strong>{" "}
                                            instead.
                                        </p>
                                    )}
                                </DeleteButton>
                            )}
                        </DangerRow>
                    </DangerZone>
                </div>
            </div>
        </main>
    );
}
