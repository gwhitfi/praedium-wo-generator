import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { MULTI_UNIT, PROPERTY_TYPE_LABELS, unitLabel } from "@/lib/defaults";
import { OPEN_STATUSES } from "@/lib/workOrders";
import PageHeader from "@/components/list/PageHeader";
import EmptyState from "@/components/list/EmptyState";
import { WorkOrderList } from "@/components/WorkOrderRow";
import TitleWithFavorite from "@/components/TitleWithFavorite";
import DeleteButton from "@/components/DeleteButton";
import DetailList, { type Detail } from "@/components/DetailList";
import DangerZone, { DangerRow } from "@/components/DangerZone";
import { ButtonLink } from "@/components/Button";
import { Tag } from "@/components/StatusBadge";
import { PencilIcon, PlusIcon } from "@/components/Icons";
import { cardClass, cardTitleClass, noticeClass, pageClass, sectionTitleClass } from "@/lib/ui";
import { ArchivePropertyButton, RestorePropertyButton } from "./ArchiveProperty";
import UnitManager from "./UnitManager";
import { deleteProperty, togglePropertyFavorite } from "../actions";

export const metadata: Metadata = { title: "Property" };

export default async function PropertyDetail({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const result = await getCurrentUser();

    if (result.state === "signed-out") {
        redirect("/sign-in");
    }

    if (result.state === "needs-org") {
        redirect("/setup");
    }

    const orgId = result.organization.id;
    const workOrderWhere = { propertyId: id, organizationId: orgId, archived: false };

    const [property, tenants, allWorkOrders, workOrderCount, openCount, completedCount, openByUnit, allByUnit] =
        await Promise.all([
            prisma.property.findFirst({
                where: { id, organizationId: orgId },
                include: {
                    units: { where: { archived: false }, orderBy: { sortOrder: "asc" } },
                },
            }),
            prisma.contact.findMany({
                where: { organizationId: orgId, archived: false, contactType: "TENANT", unit: { propertyId: id } },
                orderBy: { displayName: "asc" },
                include: { unit: true },
            }),
            // Includes archived ones so an archived property still shows its (cancelled/closed) history.
            prisma.workOrder.findMany({
                where: { propertyId: id, organizationId: orgId },
                orderBy: { createdAt: "desc" },
                take: 50,
                include: { property: true, unit: true },
            }),
            prisma.workOrder.count({ where: workOrderWhere }),
            prisma.workOrder.count({ where: { ...workOrderWhere, status: { in: OPEN_STATUSES } } }),
            prisma.workOrder.count({ where: { ...workOrderWhere, status: "COMPLETED" } }),
            // Open work orders per unit, so units with active work can't be archived.
            prisma.workOrder.groupBy({
                by: ["unitId"],
                where: { ...workOrderWhere, status: { in: OPEN_STATUSES } },
                _count: { _all: true },
            }),
            // Every work order per unit, archived included: deleting wipes all of them.
            prisma.workOrder.groupBy({
                by: ["unitId"],
                where: { propertyId: id, organizationId: orgId },
                _count: { _all: true },
            }),
        ]);

    const deletedWorkOrderCount = allByUnit.reduce((sum, g) => sum + g._count._all, 0);

    if (!property) {
        notFound();
    }

    const isMultiUnitType = MULTI_UNIT.includes(property.propertyType);
    const isSingleUnit = !isMultiUnitType && property.units.length === 1 && property.units[0].isDefault;

    const workOrders = property.archived ? allWorkOrders : allWorkOrders.filter((wo) => !wo.archived);

    // Open work first, newest first within each group.
    const isOpen = (status: (typeof workOrders)[number]["status"]) => OPEN_STATUSES.includes(status);
    const shownWorkOrders = [
        ...workOrders.filter((wo) => isOpen(wo.status)),
        ...workOrders.filter((wo) => !isOpen(wo.status)),
    ].slice(0, 10);

    const details: Detail[] = [
        {
            label: "Address",
            value: property.addressLine1,
            extra: (
                <>
                    {property.addressLine2 && <p>{property.addressLine2}</p>}
                    <p>
                        {property.city}, {property.state} {property.zipCode}
                    </p>
                </>
            ),
        },
        {
            label: "Tenants",
            value:
                tenants.length === 0
                    ? "No tenants on file"
                    : `${tenants.length} ${tenants.length === 1 ? "tenant" : "tenants"}`,
            empty: tenants.length === 0,
            extra:
                tenants.length > 0 ? (
                    <ul className="space-y-0.5">
                        {tenants.map((tenant) => (
                            <li key={tenant.id}>
                                <Link href={`/contacts/${tenant.id}`} className="hover:text-foreground hover:underline">
                                    {tenant.displayName}
                                </Link>
                                {tenant.unit && !tenant.unit.isDefault && (
                                    <span className="text-subtle"> · {unitLabel(tenant.unit.name)}</span>
                                )}
                            </li>
                        ))}
                    </ul>
                ) : undefined,
        },
    ];

    return (
        <main id="main" className={pageClass}>
            {property.archived && (
                <div className={`${noticeClass.info} mb-6 flex flex-wrap items-center justify-between gap-3`}>
                    <p>This property is archived. Restoring it won&apos;t reopen its cancelled work orders.</p>
                    <RestorePropertyButton propertyId={property.id} />
                </div>
            )}

            <PageHeader
                back={{ href: "/properties", label: "Properties" }}
                eyebrow={<Tag>{PROPERTY_TYPE_LABELS[property.propertyType]}</Tag>}
                title={
                    <TitleWithFavorite
                        name={property.displayName}
                        favorite={property.favorite}
                        archived={property.archived}
                        onToggle={togglePropertyFavorite.bind(null, property.id)}
                    />
                }
                subtitle={`${openCount} open · ${workOrderCount} ${workOrderCount === 1 ? "work order" : "work orders"} in total`}
                actions={
                    !property.archived && (
                        <>
                            <ButtonLink href={`/properties/${property.id}/edit`} size="sm" aria-label="Edit property">
                                <PencilIcon size={14} />
                                Edit
                            </ButtonLink>
                            <ButtonLink
                                href={`/work-orders/new?propertyId=${property.id}`}
                                size="sm"
                                variant="primary"
                                aria-label="New work order for this property"
                            >
                                <PlusIcon />
                                New work order
                            </ButtonLink>
                        </>
                    )
                }
            />

            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-8">
                <aside
                    className="flex flex-col gap-4 lg:col-start-2 lg:row-start-1 max-lg:order-1"
                    aria-label="Property details"
                >
                    <DetailList title="Details" details={details} />
                    {property.notes && (
                        <section aria-label="Notes" className={`${cardClass} p-4 sm:p-5`}>
                            <p className={cardTitleClass}>Notes</p>
                            <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-secondary">
                                {property.notes}
                            </p>
                        </section>
                    )}
                </aside>

                {/* On phones this column's sections join the page grid, so the details (order 1) come after the
                    work orders and before the archive and delete section (order 2). */}
                <div className="min-w-0 lg:col-start-1 lg:row-start-1 max-lg:contents">
                    <section aria-labelledby="property-work-title">
                        <h2 id="property-work-title" className={`${sectionTitleClass} mb-3`}>
                            Work orders
                        </h2>
                        {shownWorkOrders.length === 0 ? (
                            <EmptyState
                                compact
                                message="No work orders for this property yet."
                                actionHref={property.archived ? undefined : `/work-orders/new?propertyId=${property.id}`}
                                actionLabel="New work order"
                            />
                        ) : (
                            <>
                                <WorkOrderList workOrders={shownWorkOrders} hideProperty />
                                {workOrderCount > shownWorkOrders.length && (
                                    <p className="mt-2 text-sm text-subtle">
                                        Showing {shownWorkOrders.length} of {workOrderCount}, open work first.
                                    </p>
                                )}
                            </>
                        )}
                    </section>

                    {/* Phones: work orders, then the details (the address), then units, then the danger zone. */}
                    {!isSingleUnit && (
                        <section aria-labelledby="units-title" className="mt-10 max-lg:order-2 max-lg:mt-4">
                            <h2 id="units-title" className={`${sectionTitleClass} mb-3`}>
                                Units
                                <span className="ml-2 text-sm font-normal text-subtle">{property.units.length}</span>
                            </h2>

                            {property.units.length === 0 ? (
                                <EmptyState compact message="No units on file." />
                            ) : !property.archived ? (
                                <UnitManager
                                    propertyId={property.id}
                                    units={property.units.map((unit) => ({
                                        id: unit.id,
                                        name: unit.name,
                                        openCount: openByUnit.find((g) => g.unitId === unit.id)?._count._all ?? 0,
                                        workOrderCount: allByUnit.find((g) => g.unitId === unit.id)?._count._all ?? 0,
                                        tenantCount: tenants.filter((t) => t.unitId === unit.id).length,
                                    }))}
                                />
                            ) : (
                                <ul className={`${cardClass} divide-y divide-line`}>
                                    {property.units.map((unit) => (
                                        <li key={unit.id} className="px-4 py-3 text-sm font-medium sm:px-5">
                                            {unit.name}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    )}

                    <DangerZone className="max-lg:order-3 max-lg:mt-4">
                        {!property.archived && (
                            <DangerRow
                                title="Archive"
                                description={
                                    openCount > 0
                                        ? `Hide it from lists. Its ${openCount} open ${openCount === 1 ? "work order is" : "work orders are"} cancelled.`
                                        : "Hide it from lists and new work orders. You can restore it later."
                                }
                            >
                                <ArchivePropertyButton
                                    propertyId={property.id}
                                    propertyName={property.displayName}
                                    openCount={openCount}
                                    completedCount={completedCount}
                                />
                            </DangerRow>
                        )}
                        <DangerRow
                            title="Delete permanently"
                            description="Removes the property with its units and every work order for it. This can't be undone."
                        >
                            <DeleteButton
                                itemName={property.displayName}
                                onDelete={deleteProperty.bind(null, property.id)}
                            >
                                {deletedWorkOrderCount > 0 && (
                                    <p className={noticeClass.danger}>
                                        This also permanently deletes{" "}
                                        <strong>
                                            {deletedWorkOrderCount}{" "}
                                            {deletedWorkOrderCount === 1 ? "work order" : "work orders"}
                                        </strong>{" "}
                                        for this property, <strong>including archived ones</strong>, and all of their
                                        photos.
                                        {openCount > 0 &&
                                            ` ${openCount} ${openCount === 1 ? "is" : "are"} still open; contractors who were sent a link will be emailed that it's cancelled.`}
                                    </p>
                                )}
                                {!isSingleUnit && <p>All units will be deleted.</p>}
                                {tenants.length > 0 && (
                                    <p>
                                        {tenants.length} {tenants.length === 1 ? "tenant" : "tenants"} will be unlinked
                                        but stay in Contacts.
                                    </p>
                                )}
                                {!property.archived && (
                                    <p className="text-muted">
                                        To keep the history, go back and use <strong>Archive</strong> instead.
                                    </p>
                                )}
                            </DeleteButton>
                        </DangerRow>
                    </DangerZone>
                </div>
            </div>
        </main>
    );
}
