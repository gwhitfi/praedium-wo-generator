import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { PRIORITY_LABELS, unitLabel, WORK_ORDER_STATUS_LABELS } from "@/lib/defaults";
import { formatDueDate, formatTimestamp } from "@/lib/dates";
import { formatPhone } from "@/lib/phone";
import PrintButton from "@/components/PrintButton";

export default async function WorkOrderPrint({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
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
            areas: {
                orderBy: { sortOrder: "asc" },
                include: {
                    lineItems: { orderBy: { sortOrder: "asc" } },
                },
            },
        },
    });

    if (!workOrder) notFound();

    return (
        <main className="mx-auto max-w-3xl bg-white px-4 py-10 text-neutral-900">
            <div className="mb-4 flex justify-end print:hidden">
                <PrintButton />
            </div>
            <div className="hidden print:block text-xs text-neutral-500 mb-4">
                Praedium · #{workOrder.jobNumber}
            </div>
            <h1 className="mb-2 flex items-center justify-center gap-3 text-2xl font-semibold">
                {workOrder.title ?? "Untitled work order"}
                <span className="rounded-full border border-neutral-400 px-2 py-0.5 text-xs font-normal text-neutral-600">
                    {WORK_ORDER_STATUS_LABELS[workOrder.status]}
                </span>
            </h1>

            <div className="mb-4 border-y border-neutral-300 py-4 text-sm">
                <div className="grid gap-6 sm:grid-cols-3">
                    <div>
                        <h3 className="mb-1 font-semibold text-neutral-600">Address</h3>
                        <p>
                            {workOrder.property.addressLine1}
                            {workOrder.unit && !workOrder.unit.isDefault && `, ${unitLabel(workOrder.unit.name)}`}
                        </p>
                        <p>
                            {workOrder.property.city}, {workOrder.property.state} {workOrder.property.zipCode}
                        </p>
                    </div>

                    <div>
                        <h3 className="mb-1 font-semibold text-neutral-600">Contractor</h3>
                        {workOrder.inHouse ? (
                            <p>In-house</p>
                        ) : workOrder.contractorName ? (
                            <>
                                <p>{workOrder.contractorName}</p>
                                {workOrder.contractorPhone && <p>{formatPhone(workOrder.contractorPhone)}</p>}
                                {workOrder.contractorEmail && <p>{workOrder.contractorEmail}</p>}
                            </>
                        ) : (
                            <p className="text-neutral-400">Not assigned</p>
                        )}
                    </div>

                    <div>
                        <h3 className="mb-1 font-semibold text-neutral-600">Tenant</h3>
                        {workOrder.tenantName ? (
                            <>
                                <p>{workOrder.tenantName}</p>
                                {workOrder.tenantPhone && <p>{formatPhone(workOrder.tenantPhone)}</p>}
                                {workOrder.tenantEmail && <p>{workOrder.tenantEmail}</p>}
                            </>
                        ) : (
                            <p className="text-neutral-400">No tenant on file</p>
                        )}
                    </div>
                </div>
            </div>

            {(workOrder.dueDate || workOrder.notes) && (
                <div className="mb-8 grid gap-6 text-sm sm:grid-cols-3">
                    {workOrder.dueDate && (
                        <div>
                            <h3 className="mb-1 font-medium text-neutral-500">Complete by</h3>
                            <p>{formatDueDate(workOrder.dueDate)}</p>
                        </div>
                    )}

                    {workOrder.notes && (
                        <div className={workOrder.dueDate ? "sm:col-span-2" : "sm:col-span-3"}>
                            <h3 className="mb-1 font-medium text-neutral-500">Notes</h3>
                            <p className="leading-relaxed">{workOrder.notes}</p>
                        </div>
                    )}
                </div>
            )}
            <div>
                {workOrder.areas.map((area) => {
                    const urgent = area.lineItems.some((i) => i.priority === "EMERGENCY" || i.priority === "HIGH");

                    return (
                        <section key={area.id} className="mb-6 break-inside-avoid">
                            <h2 className="mb-2 flex items-center gap-2 break-after-avoid border-b border-neutral-300 pb-1 text-sm font-semibold uppercase tracking-wide text-neutral-600">
                                <span>{area.name}</span>
                                {urgent && <span className="text-sm">⚑</span>}
                            </h2>

                            {area.lineItems.length === 0 ? (
                                <p className="text-sm text-neutral-400">No items.</p>
                            ) : (
                                <ul>
                                    {area.lineItems.map((item) => (
                                        <li
                                            key={item.id}
                                            className="flex items-baseline gap-3 border-b border-neutral-200 py-2 last:border-0"
                                        >
                                            <span className="text-lg leading-none text-neutral-400">
                                                {item.completed ? "☑" : "☐"}
                                            </span>

                                            <span className="flex-1">
                                                {item.description}
                                                {item.contractorNotes && (
                                                    <span className="mt-0.5 block whitespace-pre-line text-xs italic text-neutral-500">
                                                        Contractor: {item.contractorNotes}
                                                    </span>
                                                )}
                                            </span>

                                            {(item.priority === "EMERGENCY" || item.priority === "HIGH") && (
                                                <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-neutral-600">
                                                    {PRIORITY_LABELS[item.priority]}
                                                </span>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    );
                })}
            </div>
            <section className="mt-10 break-inside-avoid border-t border-neutral-300 pt-6 text-sm">
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-600">Completion</h2>

                <div className="mb-6">
                    <p className="mb-1 text-xs text-neutral-500">Notes on work performed</p>
                    {workOrder.completionNotes ? (
                        <p className="whitespace-pre-line border-b border-neutral-300 pb-2 leading-relaxed">
                            {workOrder.completionNotes}
                        </p>
                    ) : (
                        <>
                            <div className="h-6 border-b border-neutral-300" />
                            <div className="h-6 border-b border-neutral-300" />
                            <div className="h-6 border-b border-neutral-300" />
                            <div className="h-6 border-b border-neutral-300" />
                        </>
                    )}
                </div>

                <div className="grid gap-8 sm:grid-cols-3">
                    <div className="sm:col-span-2">
                        <div className="h-10 border-b border-neutral-400" />
                        <p className="mt-1 text-xs text-neutral-500">Contractor signature</p>
                    </div>

                    <div>
                        <div className="flex h-10 items-end border-b border-neutral-400 pb-1">
                            {workOrder.completedAt && formatTimestamp(workOrder.completedAt)}
                        </div>
                        <p className="mt-1 text-xs text-neutral-500">Date completed</p>
                    </div>
                </div>
            </section>
        </main>
    );
}
