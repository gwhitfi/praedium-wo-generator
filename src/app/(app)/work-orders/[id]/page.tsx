import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { STATUS_COLORS, unitLabel, WORK_ORDER_STATUS_LABELS } from "@/lib/defaults";
import InfoCard from "@/components/InfoCard";
import AreaBuilder from "./AreaBuilder";
import StatusActions from "./StatusActions";
import ContractorLink from "./ContractorLink";
import ArchiveControls from "./ArchiveControls";
import DeleteButton from "@/components/DeleteButton";
import { deleteWorkOrder } from "../actions";
import { formatDueDate, formatTimestamp } from "@/lib/dates";
import { formatPhone } from "@/lib/phone";
import { getWorkOrderPager, readWorkOrderListView } from "@/lib/workOrderList";
import type { SearchParams } from "@/lib/sorting";
import WorkOrderPager from "./WorkOrderPager";
import ActivityLog from "./ActivityLog";

// Most history entries the page loads.
const ACTIVITY_LIMIT = 200;

export default async function WorkOrderDetail({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>;
    searchParams: Promise<SearchParams>;
}) {
    const { id } = await params;
    const query = await searchParams;
    const contractorChanged = query.contractorChanged;
    const result = await getCurrentUser();

    if (result.state === "signed-out") {
        redirect("/sign-in");
    }

    if (result.state === "needs-org") {
        redirect("/setup");
    }

    const workOrder = await prisma.workOrder.findFirst({
        where: {
            id,
            organizationId: result.organization.id,
        },
        include: {
            property: true,
            unit: true,
            contractor: { select: { id: true, displayName: true, email: true } },
            areas: {
                orderBy: { sortOrder: "asc" },
                include: {
                    lineItems: {
                        orderBy: { sortOrder: "asc" },
                        include: { attachments: { select: { id: true }, orderBy: { createdAt: "desc" }, take: 1 } },
                    },
                },
            },
        },
    });

    if (!workOrder) notFound();

    const events = await prisma.workOrderEvent.findMany({
        where: { workOrderId: workOrder.id, organizationId: result.organization.id },
        orderBy: { createdAt: "desc" },
        take: ACTIVITY_LIMIT,
        select: { id: true, type: true, createdAt: true, actorName: true, byContractor: true, detail: true },
    });

    const pager = await getWorkOrderPager(result.organization.id, await readWorkOrderListView(query), workOrder.id);

    const lineItems = workOrder.areas.flatMap((area) => area.lineItems);
    const doneCount = lineItems.filter((item) => item.completed).length;
    const finished = workOrder.status === "COMPLETED" || workOrder.status === "CLOSED";
    const cancelled = workOrder.status === "CANCELLED";
    const readOnly = finished || cancelled || workOrder.archived;
    const contractorWorking =
        !workOrder.archived && (workOrder.status === "SENT" || workOrder.status === "IN_PROGRESS");
    const canEdit = !readOnly;

    return (
        <main className="mx-auto max-w-3xl px-4 py-10 text-foreground">
            {pager && <WorkOrderPager {...pager} />}
            {workOrder.archived && (
                <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line-strong bg-surface px-4 py-3">
                    <p className="text-sm text-secondary">
                        This work order is archived. It&apos;s hidden from lists and the contractor link is disabled.
                    </p>
                    <ArchiveControls workOrderId={workOrder.id} archived />
                </div>
            )}
            <div className="mb-8">
                <div className="mb-1 flex items-center gap-3">
                    <span className="text-sm font-medium text-muted">#{workOrder.jobNumber}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_COLORS[workOrder.status]}`}>
                        {WORK_ORDER_STATUS_LABELS[workOrder.status]}
                    </span>
                    {workOrder.dueDate && (
                        <span className="text-sm text-subtle">Due by {formatDueDate(workOrder.dueDate)}</span>
                    )}
                    {lineItems.length > 0 && (
                        <span className="text-sm text-subtle">
                            {doneCount} of {lineItems.length} items done
                        </span>
                    )}
                </div>

                <div className="mb-2 flex items-start justify-between gap-4">
                    <h1 className="text-2xl font-semibold">{workOrder.title ?? "Untitled work order"}</h1>
                    {canEdit && (
                        <Link
                            href={`/work-orders/${workOrder.id}/edit`}
                            className="mt-1 shrink-0 text-sm text-muted hover:text-foreground"
                        >
                            Edit
                        </Link>
                    )}
                </div>
                {lineItems.length > 0 && (
                    <div
                        role="progressbar"
                        aria-label="Items done"
                        aria-valuemin={0}
                        aria-valuemax={lineItems.length}
                        aria-valuenow={doneCount}
                        className="mb-6 h-1 overflow-hidden rounded-full bg-line"
                    >
                        <div
                            className="h-full rounded-full bg-success"
                            style={{ width: `${(doneCount / lineItems.length) * 100}%` }}
                        />
                    </div>
                )}

                <div className="mb-8 grid gap-4 sm:grid-cols-3">
                    <InfoCard
                        label="Property"
                        title={workOrder.property.displayName}
                        href={`/properties/${workOrder.propertyId}`}
                    >
                        <p>
                            {workOrder.property.addressLine1}
                            {workOrder.unit && !workOrder.unit.isDefault && `, ${unitLabel(workOrder.unit.name)}`}
                        </p>
                        <p>
                            {workOrder.property.city}, {workOrder.property.state} {workOrder.property.zipCode}
                        </p>
                    </InfoCard>

                    <InfoCard
                        label="Contractor"
                        title={workOrder.contractorName ?? "Not assigned"}
                        href={workOrder.contractorId ? `/contacts/${workOrder.contractorId}` : undefined}
                    >
                        {workOrder.contractorPhone && <p>{formatPhone(workOrder.contractorPhone)}</p>}
                        {workOrder.contractorEmail && <p>{workOrder.contractorEmail}</p>}
                    </InfoCard>

                    <InfoCard
                        label="Tenant"
                        title={workOrder.tenantName ?? "Not assigned"}
                        href={workOrder.tenantId ? `/contacts/${workOrder.tenantId}` : undefined}
                    >
                        {workOrder.tenantPhone && <p>{formatPhone(workOrder.tenantPhone)}</p>}
                        {workOrder.tenantEmail && <p>{workOrder.tenantEmail}</p>}
                    </InfoCard>
                </div>
            </div>

            {cancelled && (
                <section className="mb-8 rounded-lg border border-line-strong bg-surface p-4">
                    <p className="mb-1 text-xs uppercase tracking-wide text-subtle">Cancelled</p>
                    <p className="text-sm text-secondary">
                        {workOrder.cancelledAt ? `Cancelled on ${formatTimestamp(workOrder.cancelledAt)}` : "Cancelled"}
                        {workOrder.cancelReason ? ` — ${workOrder.cancelReason}.` : "."}
                    </p>
                </section>
            )}

            {finished && (
                <section
                    className={`mb-8 rounded-lg border p-4 ${
                        workOrder.status === "CLOSED"
                            ? "border-status-closed/40 bg-status-closed/10"
                            : "border-status-completed/40 bg-status-completed/10"
                    }`}
                >
                    <p className="mb-1 text-xs uppercase tracking-wide text-subtle">Completion</p>
                    <p className="text-sm text-secondary">
                        {workOrder.completedAt
                            ? `Marked complete on ${formatTimestamp(workOrder.completedAt)}.`
                            : "Marked complete."}
                        {workOrder.status === "CLOSED" &&
                            workOrder.closedAt &&
                            ` Closed on ${formatTimestamp(workOrder.closedAt)}.`}
                    </p>
                    {lineItems.length - doneCount > 0 && (
                        <p className="mt-1 text-sm text-warning">
                            {lineItems.length - doneCount}{" "}
                            {lineItems.length - doneCount === 1 ? "item was" : "items were"} not checked off.
                        </p>
                    )}
                    <p className="mt-3 text-xs uppercase tracking-wide text-subtle">Completion notes</p>
                    <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-secondary">
                        {workOrder.completionNotes ?? <span className="text-subtle">No completion notes.</span>}
                    </p>
                </section>
            )}

            {!workOrder.archived && !cancelled && (
                <section className="mb-8">
                    <p className="mb-2 text-xs uppercase tracking-wide text-subtle">Contractor link</p>
                    <ContractorLink
                        workOrderId={workOrder.id}
                        token={workOrder.publicToken}
                        status={workOrder.status}
                    />
                </section>
            )}

            {workOrder.notes && (
                <div className="text-sm text-muted leading-relaxed">
                    <p className="text-xs uppercase tracking-wide text-subtle">Notes</p>
                    <p className="mt-1">{workOrder.notes}</p>
                </div>
            )}

            <AreaBuilder
                workOrderId={workOrder.id}
                areas={workOrder.areas}
                readOnly={readOnly}
                notice={contractorWorking ? "The contractor can see changes immediately." : undefined}
            />
            <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-line pt-6">
                {contractorChanged && contractorWorking && workOrder.contractorName && (
                    <p className="w-full rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
                        Contractor changed — a new link was created and the old one no longer works. Email the work
                        order to {workOrder.contractorName}.
                    </p>
                )}
                {!workOrder.archived && (
                    <StatusActions
                        workOrderId={workOrder.id}
                        status={workOrder.status}
                        hasContractor={!!workOrder.contractorId}
                        contractor={
                            workOrder.contractor && {
                                id: workOrder.contractor.id,
                                name: workOrder.contractor.displayName,
                                email: workOrder.contractor.email,
                            }
                        }
                    />
                )}
                <Link
                    href={`/work-orders/${workOrder.id}/print`}
                    className="shrink-0 rounded-md border border-line-strong px-4 py-2 text-sm text-foreground hover:bg-surface-hover"
                >
                    Print preview
                </Link>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                    <DeleteButton
                        itemName={workOrder.title ?? "Untitled work order"}
                        onDelete={deleteWorkOrder.bind(null, workOrder.id)}
                    >
                        <p>
                            Its line items, <strong>all of its photos</strong>, contractor notes and link will be
                            deleted.
                        </p>
                        {contractorWorking && (
                            <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-danger">
                                This work order is still {WORK_ORDER_STATUS_LABELS[workOrder.status].toLowerCase()}.{" "}
                                {workOrder.contractorName ?? "The contractor"} will be emailed that it&apos;s cancelled.
                            </p>
                        )}
                        {!workOrder.archived && (
                            <p className="text-muted">
                                To keep the history, go back and use <strong>Archive</strong> instead.
                            </p>
                        )}
                    </DeleteButton>
                    {!workOrder.archived && (
                        <ArchiveControls
                            workOrderId={workOrder.id}
                            archived={false}
                            willCancel={contractorWorking}
                            contractorName={workOrder.contractorName}
                        />
                    )}
                </div>
            </div>

            <ActivityLog events={events} limit={ACTIVITY_LIMIT} />
        </main>
    );
}
