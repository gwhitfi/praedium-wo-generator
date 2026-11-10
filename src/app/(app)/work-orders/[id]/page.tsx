import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { assigneeName, unitLabel, WORK_ORDER_STATUS_LABELS } from "@/lib/defaults";
import AreaBuilder from "./AreaBuilder";
import StatusActions, { CancelWorkOrderButton } from "./StatusActions";
import ContractorLink from "./ContractorLink";
import ArchiveControls from "./ArchiveControls";
import DeleteButton from "@/components/DeleteButton";
import DetailList, { ContactLine, type Detail } from "@/components/DetailList";
import DangerZone, { DangerRow } from "@/components/DangerZone";
import PageHeader, { BackLink } from "@/components/list/PageHeader";
import { ButtonLink } from "@/components/Button";
import { StatusBadge } from "@/components/StatusBadge";
import { LinkIcon, MailIcon, PencilIcon, PhoneIcon } from "@/components/Icons";
import { deleteWorkOrder } from "../actions";
import { dateInAppTimeZone, formatDueDate, formatFullDate, formatTimestamp } from "@/lib/dates";
import { formatPhone } from "@/lib/phone";
import { getWorkOrderPager, readWorkOrderListView } from "@/lib/workOrderList";
import { isOverdue, isReopenedDraft, listQuery } from "@/lib/workOrders";
import type { SearchParams } from "@/lib/sorting";
import { buttonClass, cardClass, cardTitleClass, noticeClass, pageClass } from "@/lib/ui";
import Link from "next/link";
import Steps from "@/components/Steps";
import { MAX_LINE_ITEM_PHOTOS } from "@/lib/photos";
import WorkOrderPager from "./WorkOrderPager";
import ActivityLog from "./ActivityLog";

export const metadata: Metadata = { title: "Work order" };

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
                        include: {
                            attachments: {
                                select: { id: true },
                                orderBy: { createdAt: "asc" },
                                take: MAX_LINE_ITEM_PHOTOS,
                            },
                        },
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

    const listView = await readWorkOrderListView(query);
    const pager = await getWorkOrderPager(result.organization.id, listView, workOrder.id);

    const lineItems = workOrder.areas.flatMap((area) => area.lineItems);
    const doneCount = lineItems.filter((item) => item.completed).length;
    const finished = workOrder.status === "COMPLETED" || workOrder.status === "CLOSED";
    const cancelled = workOrder.status === "CANCELLED";
    const readOnly = finished || cancelled || workOrder.archived;
    const underway = !workOrder.archived && (workOrder.status === "SENT" || workOrder.status === "IN_PROGRESS");
    // Sent or in progress with a contractor: they have the link and are emailed if it's cancelled.
    const contractorWorking = underway && !workOrder.inHouse;
    // An in-house work order the office has started: the office checks off its own line items.
    const canCheckOff = underway && workOrder.inHouse;
    const canEdit = !readOnly;
    const overdue = isOverdue(workOrder);
    const title = workOrder.title ?? "Untitled work order";
    const showLinkCard = !workOrder.archived && !cancelled && !workOrder.inHouse;
    const showContractorShortcuts =
        !workOrder.inHouse && !workOrder.archived && !!(workOrder.contractorPhone || workOrder.contractorEmail);
    const contractor = workOrder.contractor && {
        id: workOrder.contractor.id,
        name: workOrder.contractor.displayName,
        email: workOrder.contractor.email,
    };
    // A cancelled and reopened draft that would email the tenant: the Next step card asks whether to email them
    // again, naming the day they were last told (the newest send or start that emailed them).
    const lastTenantNotice = events.find(
        (event) =>
            (event.type === "SENT" || event.type === "STARTED") &&
            typeof event.detail === "object" &&
            event.detail !== null &&
            !Array.isArray(event.detail) &&
            event.detail.tenantNotified === true,
    );
    const tenantAgain =
        isReopenedDraft(workOrder) && workOrder.notifyTenant && !!workOrder.tenantEmail?.trim()
            ? { emailedOn: lastTenantNotice ? formatFullDate(dateInAppTimeZone(lastTenantNotice.createdAt)) : null }
            : null;

    const details: Detail[] = [
        {
            label: "Property",
            value: workOrder.property.displayName,
            href: `/properties/${workOrder.propertyId}`,
            extra: (
                <>
                    <p>
                        {workOrder.property.addressLine1}
                        {workOrder.unit && !workOrder.unit.isDefault && `, ${unitLabel(workOrder.unit.name)}`}
                    </p>
                    <p>
                        {workOrder.property.city}, {workOrder.property.state} {workOrder.property.zipCode}
                    </p>
                </>
            ),
        },
        {
            label: workOrder.inHouse ? "Done by" : "Contractor",
            value: assigneeName(workOrder) ?? "Not assigned yet",
            empty: !assigneeName(workOrder),
            href: workOrder.contractorId ? `/contacts/${workOrder.contractorId}` : undefined,
            extra: workOrder.inHouse ? (
                <p>Your team. There&apos;s no contractor link.</p>
            ) : (
                (workOrder.contractorPhone || workOrder.contractorEmail) && (
                    <>
                        {workOrder.contractorPhone && (
                            <ContactLine href={`tel:${workOrder.contractorPhone}`}>
                                {formatPhone(workOrder.contractorPhone)}
                            </ContactLine>
                        )}
                        {workOrder.contractorEmail && (
                            <ContactLine href={`mailto:${workOrder.contractorEmail}`}>
                                {workOrder.contractorEmail}
                            </ContactLine>
                        )}
                    </>
                )
            ),
        },
        {
            label: "Tenant",
            value: workOrder.tenantName ?? "No tenant on file",
            empty: !workOrder.tenantName,
            href: workOrder.tenantId ? `/contacts/${workOrder.tenantId}` : undefined,
            extra: (workOrder.tenantPhone || workOrder.tenantEmail) && (
                <>
                    {workOrder.tenantPhone && (
                        <ContactLine href={`tel:${workOrder.tenantPhone}`}>
                            {formatPhone(workOrder.tenantPhone)}
                        </ContactLine>
                    )}
                    {workOrder.tenantEmail && (
                        <ContactLine href={`mailto:${workOrder.tenantEmail}`}>{workOrder.tenantEmail}</ContactLine>
                    )}
                </>
            ),
        },
    ];

    return (
        <main id="main" className={pageClass}>
            <div className="mb-1 flex items-center justify-between gap-3">
                <BackLink href={`/work-orders${listQuery(listView)}`} label="Work orders" />
                {pager && (
                    <div className="mb-3">
                        <WorkOrderPager {...pager} />
                    </div>
                )}
            </div>

            {workOrder.archived && (
                <div className={`${noticeClass.info} mb-6 flex flex-wrap items-center justify-between gap-3`}>
                    <p>
                        This work order is archived. It&apos;s hidden from lists
                        {workOrder.inHouse ? "" : " and the contractor link is turned off"}.
                    </p>
                    <ArchiveControls workOrderId={workOrder.id} archived />
                </div>
            )}

            {contractorChanged && contractorWorking && workOrder.contractorName && (
                <p role="status" className={`${noticeClass.warning} mb-6`}>
                    Contractor changed, so a new link was created and the old one no longer works. Email the work
                    order to {workOrder.contractorName}.
                </p>
            )}

            <PageHeader
                eyebrow={
                    <>
                        <span className="text-sm font-medium tabular-nums text-muted">#{workOrder.jobNumber}</span>
                        <StatusBadge status={workOrder.status} />
                        {workOrder.dueDate && (
                            <span
                                className={`whitespace-nowrap text-sm ${overdue ? "font-medium text-danger" : "text-subtle"}`}
                            >
                                {overdue ? "Overdue · was due " : "Due "}
                                {formatDueDate(workOrder.dueDate)}
                            </span>
                        )}
                    </>
                }
                title={title}
                subtitle={
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                        <Link
                            href={`/properties/${workOrder.propertyId}`}
                            className="font-medium text-secondary underline decoration-line-strong underline-offset-4 hover:text-foreground hover:decoration-current"
                        >
                            {workOrder.property.displayName}
                            {workOrder.unit && !workOrder.unit.isDefault && `, ${unitLabel(workOrder.unit.name)}`}
                        </Link>
                        <span aria-hidden>·</span>
                        {workOrder.contractorId ? (
                            <Link
                                href={`/contacts/${workOrder.contractorId}`}
                                className="font-medium text-secondary underline decoration-line-strong underline-offset-4 hover:text-foreground hover:decoration-current"
                            >
                                {assigneeName(workOrder)}
                            </Link>
                        ) : (
                            <span className={workOrder.inHouse ? "font-medium text-secondary" : "text-subtle"}>
                                {workOrder.inHouse ? "In-house" : "No contractor yet"}
                            </span>
                        )}
                    </span>
                }
                actions={
                    // On phones Edit joins the shortcut row below instead of taking a row of its own.
                    canEdit && (
                        <ButtonLink href={`/work-orders/${workOrder.id}/edit`} size="sm" className="max-sm:hidden">
                            <PencilIcon size={14} />
                            Edit details
                        </ButtonLink>
                    )
                }
            />

            {workOrder.status === "DRAFT" && !workOrder.archived ? (
                // A draft is still being set up: show where it is in the create steps instead of a progress bar.
                <Steps
                    className="-mt-2 mb-8"
                    steps={[
                        { label: "Details", href: `/work-orders/${workOrder.id}/edit` },
                        "The work",
                        workOrder.inHouse ? "Start" : "Send",
                    ]}
                    // "The work" stays the current step while drafting; Send is a step you take, not one you reach
                    // by adding the first item.
                    current={2}
                />
            ) : (
                lineItems.length > 0 && (
                    <div className="-mt-3 mb-8 flex items-center gap-3">
                        <div
                            role="progressbar"
                            aria-label="Items done"
                            aria-valuemin={0}
                            aria-valuemax={lineItems.length}
                            aria-valuenow={doneCount}
                            aria-valuetext={`${doneCount} of ${lineItems.length} items done`}
                            className="h-1.5 flex-1 overflow-hidden rounded-full bg-line"
                        >
                            <div
                                className="h-full rounded-full bg-success transition-[width]"
                                style={{ width: `${(doneCount / lineItems.length) * 100}%` }}
                            />
                        </div>
                        <span className="shrink-0 text-sm tabular-nums text-muted">
                            {doneCount} of {lineItems.length} done
                        </span>
                    </div>
                )
            )}

            {/* Phones and tablets: the details come after the work, so reaching the contractor gets a shortcut up
                here (and, on phones, Edit sits in the same row). */}
            {(showContractorShortcuts || canEdit) && (
                <nav aria-label="Shortcuts" className="-mt-4 mb-6 flex flex-wrap gap-2 lg:hidden empty:hidden">
                    {canEdit && (
                        <ButtonLink href={`/work-orders/${workOrder.id}/edit`} size="sm" className="sm:hidden">
                            <PencilIcon size={14} />
                            Edit
                        </ButtonLink>
                    )}
                    {showContractorShortcuts && workOrder.contractorPhone && (
                        <a href={`tel:${workOrder.contractorPhone}`} className={buttonClass({ size: "sm" })}>
                            <PhoneIcon size={14} />
                            Call
                            <span className="sr-only"> {workOrder.contractorName}</span>
                        </a>
                    )}
                    {showContractorShortcuts && workOrder.contractorEmail && (
                        <a href={`mailto:${workOrder.contractorEmail}`} className={buttonClass({ size: "sm" })}>
                            <MailIcon size={14} />
                            Email
                            <span className="sr-only"> {workOrder.contractorName}</span>
                        </a>
                    )}
                    {showLinkCard && workOrder.status !== "DRAFT" && (
                        <a href="#contractor-link" className={buttonClass({ size: "sm" })}>
                            <LinkIcon size={14} />
                            Contractor link
                        </a>
                    )}
                </nav>
            )}

            {/* The code's order is the phone order (Next step, the work, then the details), so screen readers and
                keyboards follow what's shown; wide screens place the work on the left and Next step and the details
                on the right with grid positions. */}
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:grid-rows-[auto_1fr] lg:gap-x-8">
                <div className="lg:col-start-2 lg:row-start-1">
                    <StatusActions
                        workOrderId={workOrder.id}
                        status={workOrder.status}
                        inHouse={workOrder.inHouse}
                        contractor={contractor}
                        doneCount={doneCount}
                        itemCount={lineItems.length}
                        archived={workOrder.archived}
                        tenantAgain={tenantAgain}
                    />
                </div>

                <div className="min-w-0 lg:col-start-1 lg:row-span-2 lg:row-start-1">
                    {cancelled && (
                        <section aria-label="Cancellation" className={`${cardClass} mb-6 p-4 sm:p-5`}>
                            <p className={cardTitleClass}>Cancelled</p>
                            <p className="mt-1 text-sm text-secondary">
                                {workOrder.cancelledAt
                                    ? `Cancelled on ${formatTimestamp(workOrder.cancelledAt)}`
                                    : "Cancelled"}
                                {workOrder.cancelReason ? `: ${workOrder.cancelReason}` : "."}
                            </p>
                        </section>
                    )}

                    {finished && (
                        <section aria-label="Completion" className={`${cardClass} mb-6 p-4 sm:p-5`}>
                            <p className={cardTitleClass}>Completion</p>
                            <p className="mt-1 text-sm text-secondary">
                                {workOrder.completedAt
                                    ? `Marked complete on ${formatTimestamp(workOrder.completedAt)}.`
                                    : "Marked complete."}
                                {workOrder.status === "CLOSED" &&
                                    workOrder.closedAt &&
                                    ` Closed on ${formatTimestamp(workOrder.closedAt)}.`}
                            </p>
                            <p className={`${cardTitleClass} mt-4`}>Completion notes</p>
                            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-secondary">
                                {workOrder.completionNotes ?? (
                                    <span className="text-subtle">The contractor didn&apos;t leave any.</span>
                                )}
                            </p>
                        </section>
                    )}

                    {workOrder.notes && (
                        <section aria-label="Notes" className={`${cardClass} mb-6 p-4 sm:p-5`}>
                            <p className={cardTitleClass}>Notes for the contractor</p>
                            <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-secondary">
                                {workOrder.notes}
                            </p>
                        </section>
                    )}

                    <AreaBuilder
                        workOrderId={workOrder.id}
                        areas={workOrder.areas}
                        readOnly={readOnly}
                        canCheckOff={canCheckOff}
                        building={workOrder.status === "DRAFT"}
                        notice={
                            contractorWorking
                                ? "The contractor checks items off from their link, and sees your changes right away."
                                : undefined
                        }
                    />

                    <ActivityLog events={events} limit={ACTIVITY_LIMIT} />
                </div>

                <aside className="flex flex-col gap-4 lg:col-start-2 lg:row-start-2" aria-label="Details">
                    <DetailList title="Details" details={details} />
                    {showLinkCard && (
                        <ContractorLink
                            workOrderId={workOrder.id}
                            token={workOrder.publicToken}
                            status={workOrder.status}
                        />
                    )}
                </aside>
            </div>

            {/* Last on every screen size; on wide screens it lines up with the work column. */}
            <div className="lg:pr-[22rem]">
                <DangerZone>
                    {underway && (
                        <DangerRow
                            title="Cancel"
                            description={
                                workOrder.inHouse
                                    ? "Stop the work and move it to Cancelled."
                                    : "Stop the work. The contractor is told and their link stops working."
                            }
                        >
                            <CancelWorkOrderButton
                                workOrderId={workOrder.id}
                                inHouse={workOrder.inHouse}
                                contractor={contractor}
                            />
                        </DangerRow>
                    )}
                    {!workOrder.archived && (
                        <DangerRow
                            title="Archive"
                            description={
                                underway
                                    ? "Hide it from lists. It's cancelled first, since it's still open."
                                    : "Hide it from lists and keep its history. You can restore it later."
                            }
                        >
                            <ArchiveControls
                                workOrderId={workOrder.id}
                                archived={false}
                                willCancel={underway}
                                inHouse={workOrder.inHouse}
                                contractorName={workOrder.contractorName}
                            />
                        </DangerRow>
                    )}
                    <DangerRow
                        title="Delete permanently"
                        description="Removes it with its items, photos, notes and history. This can't be undone."
                    >
                        <DeleteButton itemName={title} onDelete={deleteWorkOrder.bind(null, workOrder.id)}>
                            <p>
                                Its line items, <strong>all of its photos</strong>, contractor notes and link will be
                                deleted.
                            </p>
                            {contractorWorking && (
                                <p className={noticeClass.danger}>
                                    This work order is still{" "}
                                    {WORK_ORDER_STATUS_LABELS[workOrder.status].toLowerCase()}.{" "}
                                    {workOrder.contractorName ?? "The contractor"} will be emailed that it&apos;s
                                    cancelled.
                                </p>
                            )}
                            {!workOrder.archived && (
                                <p className="text-muted">
                                    To keep the history, go back and use <strong>Archive</strong> instead.
                                </p>
                            )}
                        </DeleteButton>
                    </DangerRow>
                </DangerZone>
            </div>
        </main>
    );
}
