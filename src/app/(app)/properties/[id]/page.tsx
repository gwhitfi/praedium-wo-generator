import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { MULTI_UNIT, PROPERTY_TYPE_LABELS, unitLabel } from "@/lib/defaults";
import { OPEN_STATUSES } from "@/lib/workOrders";
import InfoCard from "@/components/InfoCard";
import { Favorite } from "@/components/list/List";
import { WorkOrderList } from "@/components/WorkOrderRow";
import { ArchivePropertyButton, RestorePropertyButton } from "./ArchiveProperty";
import UnitManager from "./UnitManager";
import FavoriteToggle from "@/components/FavoriteToggle";
import DeleteButton from "@/components/DeleteButton";
import { deleteProperty, togglePropertyFavorite } from "../actions";

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

    return (
        <main className="mx-auto max-w-3xl px-4 py-10 text-foreground">
            {property.archived && (
                <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line-strong bg-surface px-4 py-3">
                    <p className="text-sm text-secondary">
                        This property is archived. Restoring it won&apos;t reopen its cancelled work orders.
                    </p>
                    <RestorePropertyButton propertyId={property.id} />
                </div>
            )}
            <div className="mb-8">
                <span className="mb-2 inline-block rounded-full border border-line-strong px-2 py-0.5 text-xs text-muted">
                    {PROPERTY_TYPE_LABELS[property.propertyType]}
                </span>
                <div className="mb-4 flex items-start justify-between gap-4">
                    <h1 className="text-2xl font-semibold">
                        {property.displayName}
                        {property.archived ? (
                            <Favorite show={property.favorite} />
                        ) : (
                            <FavoriteToggle
                                favorite={property.favorite}
                                onToggle={togglePropertyFavorite.bind(null, property.id)}
                            />
                        )}
                    </h1>
                    {!property.archived && (
                        <Link
                            href={`/properties/${property.id}/edit`}
                            className="mt-1 shrink-0 text-sm text-muted hover:text-foreground"
                        >
                            Edit
                        </Link>
                    )}
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                    <InfoCard label="Address" title={property.addressLine1}>
                        {property.addressLine2 && <p>{property.addressLine2}</p>}
                        <p>
                            {property.city}, {property.state} {property.zipCode}
                        </p>
                    </InfoCard>

                    <InfoCard
                        label="Tenants"
                        title={
                            tenants.length === 0
                                ? "No tenants on file"
                                : `${tenants.length} ${tenants.length === 1 ? "tenant" : "tenants"}`
                        }
                    >
                        {tenants.map((tenant) => (
                            <Link
                                key={tenant.id}
                                href={`/contacts/${tenant.id}`}
                                className="block truncate hover:text-foreground hover:underline"
                            >
                                {tenant.displayName}
                                {tenant.unit && !tenant.unit.isDefault && (
                                    <span className="text-subtle"> · {unitLabel(tenant.unit.name)}</span>
                                )}
                            </Link>
                        ))}
                    </InfoCard>

                    <InfoCard label="Work orders" title={`${openCount} open`}>
                        <p>{workOrderCount} total</p>
                    </InfoCard>
                </div>
            </div>

            {property.notes && (
                <div className="mb-8 text-sm leading-relaxed text-muted">
                    <p className="text-xs uppercase tracking-wide text-subtle">Notes</p>
                    <p className="mt-1 whitespace-pre-line">{property.notes}</p>
                </div>
            )}

            <section className="mb-8 border-t border-line pt-6">
                <div className="mb-3 flex items-baseline justify-between gap-4">
                    <h2 className="text-lg font-semibold">Work orders</h2>
                    {!property.archived && (
                        <Link
                            href={`/work-orders/new?propertyId=${property.id}`}
                            className="shrink-0 text-sm text-muted hover:text-foreground"
                        >
                            + New work order
                        </Link>
                    )}
                </div>
                {shownWorkOrders.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-line px-4 py-4 text-sm text-subtle">
                        No work orders for this property yet.
                    </p>
                ) : (
                    <WorkOrderList workOrders={shownWorkOrders} />
                )}
            </section>

            {!isSingleUnit && (
                <section className="border-t border-line pt-6">
                    <h2 className="mb-3 text-lg font-semibold">Units</h2>

                    {property.units.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-line px-4 py-4 text-sm text-subtle">
                            No units on file.
                        </p>
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
                        <ul className="flex flex-col gap-2">
                            {property.units.map((unit) => (
                                <li
                                    key={unit.id}
                                    className="rounded-lg border border-line bg-surface px-4 py-3 font-medium"
                                >
                                    {unit.name}
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            )}
            <div className="mt-8 flex flex-wrap justify-end gap-2 border-t border-line pt-6">
                <DeleteButton itemName={property.displayName} onDelete={deleteProperty.bind(null, property.id)}>
                    {deletedWorkOrderCount > 0 && (
                        <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-danger">
                            This also permanently deletes{" "}
                            <strong>
                                {deletedWorkOrderCount} {deletedWorkOrderCount === 1 ? "work order" : "work orders"}
                            </strong>{" "}
                            for this property, <strong>including archived ones</strong>, and all of their photos.
                            {openCount > 0 &&
                                ` ${openCount} ${openCount === 1 ? "is" : "are"} still open; contractors who were sent a link will be emailed that it's cancelled.`}
                        </p>
                    )}
                    {!isSingleUnit && <p>All units will be deleted.</p>}
                    {tenants.length > 0 && (
                        <p>
                            {tenants.length} {tenants.length === 1 ? "tenant" : "tenants"} will be unlinked but stay in
                            Contacts.
                        </p>
                    )}
                    {!property.archived && (
                        <p className="text-muted">
                            To keep the history, go back and use <strong>Archive property</strong> instead.
                        </p>
                    )}
                </DeleteButton>
                {!property.archived && (
                    <ArchivePropertyButton
                        propertyId={property.id}
                        propertyName={property.displayName}
                        openCount={openCount}
                        completedCount={completedCount}
                    />
                )}
            </div>
        </main>
    );
}
