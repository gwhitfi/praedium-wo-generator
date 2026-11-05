import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { STATUS_COLORS, unitLabel, WORK_ORDER_STATUS_LABELS } from "@/lib/defaults";
import InfoCard from "@/components/InfoCard";
import ThemeToggle from "@/components/ThemeToggle";
import ContractorSpaceCard from "./ContractorSpaceCard";
import CompleteWorkOrder from "./CompleteWorkOrder";
import RecordOpen from "./RecordOpen";
import { formatDueDate, formatTimestamp } from "@/lib/dates";
import { formatPhone } from "@/lib/phone";

export const metadata: Metadata = {
    title: "Work Order",
    robots: { index: false, follow: false },
    referrer: "no-referrer",
};

export default async function PublicWorkOrder({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;

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
                        include: { attachments: { select: { id: true }, orderBy: { createdAt: "desc" }, take: 1 } },
                    },
                },
            },
        },
    });

    if (!workOrder || workOrder.archived || workOrder.status === "DRAFT" || workOrder.status === "CANCELLED") {
        notFound();
    }

    const readOnly = workOrder.status === "COMPLETED" || workOrder.status === "CLOSED";
    const itemCount = workOrder.areas.reduce((sum, area) => sum + area.lineItems.length, 0);
    const completedCount = workOrder.areas.reduce(
        (sum, area) => sum + area.lineItems.filter((i) => i.completed).length,
        0,
    );

    return (
        <main className="mx-auto max-w-3xl px-4 py-10 text-foreground">
            <div className="mb-8">
                {/* Standard light/dark only: the theme script never applies Settings palettes on /wo/ pages. */}
                <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-xs uppercase tracking-wide text-subtle">
                        {workOrder.organization.name} · #{workOrder.jobNumber}
                    </p>
                    <div className="print:hidden">
                        <ThemeToggle />
                    </div>
                </div>

                <div className="mb-1 flex items-center gap-3">
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_COLORS[workOrder.status]}`}>
                        {WORK_ORDER_STATUS_LABELS[workOrder.status]}
                    </span>
                    {workOrder.dueDate && (
                        <span className="text-sm text-subtle">Due by {formatDueDate(workOrder.dueDate)}</span>
                    )}
                </div>

                <h1 className="mb-4 text-2xl font-semibold">{workOrder.title ?? "Work order"}</h1>

                {workOrder.status === "COMPLETED" && (
                    <p className="mb-4 rounded-md border border-status-completed/40 bg-status-completed/10 px-3 py-2 text-sm text-status-completed">
                        Marked complete{workOrder.completedAt && ` on ${formatTimestamp(workOrder.completedAt)}`}.
                        Contact the office if anything needs to change.
                    </p>
                )}
                {workOrder.status === "CLOSED" && (
                    <p className="mb-4 rounded-md border border-status-closed/40 bg-status-closed/10 px-3 py-2 text-sm text-status-closed">
                        This work order has been closed out. No further work is needed.
                    </p>
                )}

                <div className="grid gap-4 sm:grid-cols-3">
                    <InfoCard
                        label="Property"
                        title={`${workOrder.property.addressLine1}${
                            workOrder.unit && !workOrder.unit.isDefault ? `, ${unitLabel(workOrder.unit.name)}` : ""
                        }`}
                    >
                        {workOrder.property.addressLine2 && <p>{workOrder.property.addressLine2}</p>}
                        <p>
                            {workOrder.property.city}, {workOrder.property.state} {workOrder.property.zipCode}
                        </p>
                    </InfoCard>

                    <InfoCard label="Tenant" title={workOrder.tenantName ?? "No tenant on file"}>
                        {workOrder.tenantPhone && (
                            <a href={`tel:${workOrder.tenantPhone}`} className="block hover:text-foreground">
                                {formatPhone(workOrder.tenantPhone)}
                            </a>
                        )}
                        {workOrder.tenantEmail && (
                            <a
                                href={`mailto:${workOrder.tenantEmail}`}
                                className="block break-all hover:text-foreground"
                            >
                                {workOrder.tenantEmail}
                            </a>
                        )}
                    </InfoCard>

                    <InfoCard label="Office" title={workOrder.organization.name}>
                        {workOrder.organization.phone && (
                            <a href={`tel:${workOrder.organization.phone}`} className="block hover:text-foreground">
                                {formatPhone(workOrder.organization.phone)}
                            </a>
                        )}
                        {workOrder.organization.email && (
                            <a
                                href={`mailto:${workOrder.organization.email}`}
                                className="block break-all hover:text-foreground"
                            >
                                {workOrder.organization.email}
                            </a>
                        )}
                        {!workOrder.organization.phone && !workOrder.organization.email && (
                            <p className="text-subtle">No contact info on file</p>
                        )}
                    </InfoCard>
                </div>
            </div>

            {workOrder.notes && (
                <div className="mb-6 text-sm text-muted leading-relaxed">
                    <p className="text-xs uppercase tracking-wide text-subtle">Notes</p>
                    <p className="mt-1 whitespace-pre-line">{workOrder.notes}</p>
                </div>
            )}

            <div className="border-t border-line pt-6">
                <div className="flex items-baseline justify-between">
                    <h2 className="text-lg font-semibold text-foreground">Work items</h2>
                    {itemCount > 0 && (
                        <span className="text-sm text-subtle">
                            {completedCount} of {itemCount} done
                        </span>
                    )}
                </div>
                {!readOnly && (
                    <p className="mt-1 mb-4 text-sm text-subtle">
                        Check off each item as you finish it. Add a note if anything needs explaining.
                    </p>
                )}

                {workOrder.areas.length === 0 ? (
                    <p className="mt-4 text-sm text-subtle">No work items listed.</p>
                ) : (
                    <ul className="mt-4 flex flex-col gap-2">
                        {workOrder.areas.map((area) => (
                            <ContractorSpaceCard key={area.id} token={token} area={area} readOnly={readOnly} />
                        ))}
                    </ul>
                )}
            </div>

            {readOnly ? (
                workOrder.completionNotes && (
                    <section className="mt-8 border-t border-line pt-6 text-sm">
                        <p className="text-xs uppercase tracking-wide text-subtle">Completion notes</p>
                        <p className="mt-1 whitespace-pre-line leading-relaxed text-secondary">
                            {workOrder.completionNotes}
                        </p>
                    </section>
                )
            ) : (
                <CompleteWorkOrder token={token} remainingCount={itemCount - completedCount} />
            )}

            <p className="mt-10 text-center text-xs text-subtle print:hidden">
                {workOrder.organization.name} can see when this page is opened and what&apos;s been checked off.
            </p>
            <p className="mt-2 text-center text-xs text-subtle print:hidden">
                <Link href="/privacy" className="underline hover:text-foreground">
                    Privacy Policy
                </Link>
            </p>
            <RecordOpen token={token} />
        </main>
    );
}
