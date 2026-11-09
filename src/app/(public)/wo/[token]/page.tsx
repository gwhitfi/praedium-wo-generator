import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { unitLabel } from "@/lib/defaults";
import ThemeToggle from "@/components/ThemeToggle";
import DetailList, { ContactLine, type Detail } from "@/components/DetailList";
import { StatusBadge } from "@/components/StatusBadge";
import { ChevronRightIcon, LockIcon } from "@/components/Icons";
import ContractorSpaceCard from "./ContractorSpaceCard";
import CompleteWorkOrder from "./CompleteWorkOrder";
import RecordOpen from "./RecordOpen";
import VerifyBox from "./VerifyBox";
import { canLookup, countContractorWorkOrders, maskEmail, summaryAreas } from "@/lib/contractorWorkOrders";
import { openInput } from "./schemas";
import { isVerifiedFor } from "@/lib/contractorAccess";
import { formatDueDate, formatTimestamp } from "@/lib/dates";
import { formatPhone } from "@/lib/phone";
import { cardClass, cardTitleClass, noticeClass } from "@/lib/ui";
import { MAX_LINE_ITEM_PHOTOS } from "@/lib/photos";

export const metadata: Metadata = {
    title: "Work order",
    robots: { index: false, follow: false },
    referrer: "no-referrer",
};

export default async function PublicWorkOrder({
    params,
}: {
    params: Promise<{ token: string }>;
}): Promise<React.ReactElement> {
    const { token } = await params;
    if (!openInput.safeParse({ token }).success) notFound();

    const workOrder = await prisma.workOrder.findUnique({
        where: { publicToken: token },
        include: {
            organization: { select: { name: true, phone: true, email: true } },
            property: true,
            unit: true,
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

    // An in-house work order has no contractor, so its link never shows anything.
    if (
        !workOrder ||
        workOrder.archived ||
        workOrder.inHouse ||
        workOrder.status === "DRAFT" ||
        workOrder.status === "CANCELLED"
    ) {
        notFound();
    }

    const readOnly = workOrder.status === "COMPLETED" || workOrder.status === "CLOSED";
    const itemCount = workOrder.areas.reduce((sum, area) => sum + area.lineItems.length, 0);
    const completedCount = workOrder.areas.reduce(
        (sum, area) => sum + area.lineItems.filter((i) => i.completed).length,
        0,
    );

    const verified = await isVerifiedFor(workOrder);
    // With no contractor email on file nobody could verify, so the link stays fully open as before.
    const gated = !!workOrder.contractorEmail && !verified;
    const closed = workOrder.status === "CLOSED";
    // Closed jobs show the summary only, verified or not.
    const hideSensitive = gated || closed;
    const areas = hideSensitive ? summaryAreas(workOrder.areas) : workOrder.areas;
    const otherCount = verified && canLookup(workOrder) ? await countContractorWorkOrders(workOrder) : 0;
    const address = `${workOrder.property.addressLine1}${
        workOrder.unit && !workOrder.unit.isDefault ? `, ${unitLabel(workOrder.unit.name)}` : ""
    }`;
    const mapsHref = `https://maps.google.com/?q=${encodeURIComponent(
        `${workOrder.property.addressLine1}, ${workOrder.property.city}, ${workOrder.property.state} ${workOrder.property.zipCode}`,
    )}`;

    const details: Detail[] = [
        {
            label: "Where",
            value: (
                <a
                    href={mapsHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline decoration-line-strong underline-offset-4 hover:text-accent hover:decoration-current"
                >
                    {address}
                    <span className="sr-only"> (opens a map)</span>
                </a>
            ),
            extra: (
                <>
                    {workOrder.property.addressLine2 && <p>{workOrder.property.addressLine2}</p>}
                    <p>
                        {workOrder.property.city}, {workOrder.property.state} {workOrder.property.zipCode}
                    </p>
                </>
            ),
        },
        hideSensitive
            ? {
                  label: "Tenant",
                  value: closed ? "Not shown on closed work orders" : "Verify to see contact details",
                  empty: true,
              }
            : {
                  label: "Tenant",
                  value: workOrder.tenantName ?? "No tenant on file",
                  empty: !workOrder.tenantName,
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
        {
            label: "Office",
            value: workOrder.organization.name,
            extra:
                workOrder.organization.phone || workOrder.organization.email ? (
                    <>
                        {workOrder.organization.phone && (
                            <ContactLine href={`tel:${workOrder.organization.phone}`}>
                                {formatPhone(workOrder.organization.phone)}
                            </ContactLine>
                        )}
                        {workOrder.organization.email && (
                            <ContactLine href={`mailto:${workOrder.organization.email}`}>
                                {workOrder.organization.email}
                            </ContactLine>
                        )}
                    </>
                ) : (
                    <p>No contact info on file</p>
                ),
        },
    ];

    return (
        <main id="main" className="mx-auto max-w-2xl px-4 pt-5 pb-12 text-foreground sm:pt-8">
            {/* Standard light/dark only: the theme script never applies Settings palettes on /wo/ pages. */}
            <div className="mb-4 flex items-center justify-between gap-3">
                <p className="min-w-0 truncate text-sm font-medium text-muted">{workOrder.organization.name}</p>
                <div className="-mr-2 shrink-0 print:hidden">
                    <ThemeToggle />
                </div>
            </div>

            {otherCount > 0 && (
                <Link
                    href={`/wo/${token}/list`}
                    className={`${cardClass} mb-4 flex items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-foreground hover:border-line-hover print:hidden`}
                >
                    {otherCount === 1 ? "You have 1 other work order" : `You have ${otherCount} other work orders`}
                    <ChevronRightIcon size={16} className="text-subtle" />
                </Link>
            )}
            {gated && !closed && workOrder.contractorEmail && (
                <VerifyBox token={token} emailHint={maskEmail(workOrder.contractorEmail)} />
            )}

            <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-sm tabular-nums text-subtle">#{workOrder.jobNumber}</span>
                <StatusBadge status={workOrder.status} />
                {workOrder.dueDate && (
                    <span className="text-sm text-subtle">Due {formatDueDate(workOrder.dueDate, { weekday: true })}</span>
                )}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight [overflow-wrap:anywhere]">
                {workOrder.title ?? "Work order"}
            </h1>

            {itemCount > 0 && (
                <div className="mt-3 flex items-center gap-3">
                    <div
                        role="progressbar"
                        aria-label="Items done"
                        aria-valuemin={0}
                        aria-valuemax={itemCount}
                        aria-valuenow={completedCount}
                        aria-valuetext={`${completedCount} of ${itemCount} items done`}
                        className="h-2 flex-1 overflow-hidden rounded-full bg-line"
                    >
                        <div
                            className="h-full rounded-full bg-success"
                            style={{ width: `${(completedCount / itemCount) * 100}%` }}
                        />
                    </div>
                    <span className="shrink-0 text-sm tabular-nums text-muted">
                        {completedCount} of {itemCount} done
                    </span>
                </div>
            )}

            {workOrder.status === "COMPLETED" && (
                <p role="status" className={`${noticeClass.success} mt-4`}>
                    Marked complete{workOrder.completedAt && ` on ${formatTimestamp(workOrder.completedAt)}`}. Contact
                    the office if anything needs to change.
                </p>
            )}
            {workOrder.status === "CLOSED" && (
                <p role="status" className={`${noticeClass.info} mt-4`}>
                    This work order has been closed out. No further work is needed.
                </p>
            )}

            <DetailList details={details} className="mt-5" />

            {workOrder.notes &&
                (hideSensitive ? (
                    !closed && <p className="mt-4 text-sm text-subtle">Notes from the office show after you verify.</p>
                ) : (
                    <section aria-label="Notes from the office" className={`${cardClass} mt-4 p-4`}>
                        <p className={cardTitleClass}>Notes from the office</p>
                        <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-secondary">
                            {workOrder.notes}
                        </p>
                    </section>
                ))}

            <section aria-labelledby="items-title" className="mt-8">
                <h2 id="items-title" className="text-lg font-semibold text-foreground">
                    The work
                </h2>
                {!readOnly && (
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                        {gated && <LockIcon size={14} className="shrink-0" />}
                        {gated
                            ? "Locked until you confirm it's you above."
                            : "Tap an item when it's done. Add a note if anything needs explaining."}
                    </p>
                )}

                {areas.length === 0 ? (
                    <p className="mt-4 text-sm text-subtle">No work items listed.</p>
                ) : (
                    <ul className="mt-4 flex flex-col gap-3">
                        {areas.map((area) => (
                            <ContractorSpaceCard
                                key={area.id}
                                token={token}
                                area={area}
                                readOnly={readOnly || hideSensitive}
                                summaryOnly={hideSensitive}
                            />
                        ))}
                    </ul>
                )}
            </section>

            {hideSensitive ? null : readOnly ? (
                workOrder.completionNotes && (
                    <section aria-label="Completion notes" className={`${cardClass} mt-8 p-4 text-sm`}>
                        <p className={cardTitleClass}>Your completion notes</p>
                        <p className="mt-1.5 whitespace-pre-line leading-relaxed text-secondary">
                            {workOrder.completionNotes}
                        </p>
                    </section>
                )
            ) : (
                <CompleteWorkOrder token={token} remainingCount={itemCount - completedCount} />
            )}

            <footer className="mt-12 border-t border-line pt-6 text-center text-xs text-subtle print:hidden">
                <p>{workOrder.organization.name} can see when this page is opened and what&apos;s been checked off.</p>
                <p className="mt-2">
                    Sent with Praedium ·{" "}
                    <Link href="/privacy" className="underline hover:text-foreground">
                        Privacy Policy
                    </Link>
                </p>
            </footer>
            <RecordOpen token={token} />
        </main>
    );
}
