import Link from "next/link";
import prisma from "@/lib/prisma";
import type { Organization, User } from "@/generated/prisma/client";
import Nav from "@/components/Nav";
import AiPrompt from "./AiPrompt";
import PageHeader from "@/components/list/PageHeader";
import { WorkOrderList } from "@/components/WorkOrderRow";
import { WORK_ORDER_FILTERS, WORK_ORDER_SORTS } from "@/lib/workOrders";
import { parseSort, sortLabels, sortRows, type SearchParams } from "@/lib/sorting";

const include = { property: true, unit: true, contractor: { select: { firstName: true, lastName: true } } } as const;

export default async function Dashboard({
    organization,
    user,
    params,
}: {
    organization: Organization;
    user: User;
    params: SearchParams;
}) {
    const base = { organizationId: organization.id, archived: false };
    // One sort applies to both lists. Without one, each keeps its own order.
    const sort = parseSort(params, WORK_ORDER_SORTS);
    const label = sortLabels("/", params, WORK_ORDER_SORTS, sort);

    const [
        draftCount,
        activeCount,
        completedCount,
        overdueCount,
        completedOrders,
        overdueOrders,
        recentOrders,
        propertyCount,
        contractorCount,
        workOrderCount,
    ] = await Promise.all([
        prisma.workOrder.count({ where: { ...base, ...WORK_ORDER_FILTERS.draft.where() } }),
        prisma.workOrder.count({ where: { ...base, ...WORK_ORDER_FILTERS.active.where() } }),
        prisma.workOrder.count({ where: { ...base, ...WORK_ORDER_FILTERS.completed.where() } }),
        prisma.workOrder.count({ where: { ...base, ...WORK_ORDER_FILTERS.overdue.where() } }),
        prisma.workOrder.findMany({
            where: { ...base, ...WORK_ORDER_FILTERS.completed.where() },
            orderBy: { completedAt: "asc" },
            take: 10,
            include,
        }),
        prisma.workOrder.findMany({
            where: { ...base, ...WORK_ORDER_FILTERS.overdue.where() },
            orderBy: { dueDate: "asc" },
            take: 10,
            include,
        }),
        prisma.workOrder.findMany({ where: base, orderBy: { updatedAt: "desc" }, take: 25, include }),
        prisma.property.count({ where: base }),
        prisma.contact.count({ where: { ...base, contactType: "CONTRACTOR" } }),
        prisma.workOrder.count({ where: { organizationId: organization.id } }),
    ]);

    const needsAttention = [...completedOrders, ...overdueOrders].slice(0, 10);
    const attentionIds = new Set(needsAttention.map((wo) => wo.id));
    const recentActivity = recentOrders.filter((wo) => !attentionIds.has(wo.id)).slice(0, 5);

    const steps = [
        { label: "Add your first property", href: "/properties/new", done: propertyCount > 0 },
        { label: "Add a contractor", href: "/contacts/new", done: contractorCount > 0 },
        { label: "Set your office contact", href: "/settings", done: !!(organization.phone || organization.email) },
        { label: "Create a work order", href: "/work-orders/new", done: workOrderCount > 0 },
    ];

    return (
        <div className="text-foreground">
            <Nav showAi={user.aiEnabled !== false} />
            <main className="mx-auto max-w-5xl px-4 py-10">
                <PageHeader
                    title={organization.name}
                    subtitle="Dashboard"
                    actionHref="/work-orders/new"
                    actionLabel="Create work order"
                    mobileLabel="+ New"
                />

                {user.aiEnabled === null && <AiPrompt />}

                {steps.some((s) => !s.done) && <GetStarted steps={steps} />}

                <div className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <StatCard label="Drafts" value={draftCount} href="/work-orders?status=draft" />
                    <StatCard
                        label="With contractor"
                        value={activeCount}
                        href="/work-orders?status=active"
                        accent="text-status-sent"
                    />
                    <StatCard
                        label="To review"
                        value={completedCount}
                        href="/work-orders?status=completed"
                        accent="text-status-completed"
                    />
                    <StatCard
                        label="Overdue"
                        value={overdueCount}
                        href="/work-orders?status=overdue"
                        accent="text-danger"
                    />
                </div>

                {needsAttention.length > 0 && (
                    <section className="mb-10">
                        <SectionHeading title="Needs attention" />
                        <p className="-mt-2 mb-3 text-sm text-subtle">
                            Completed work waiting to be closed out, and open work past its due date.
                        </p>
                        <WorkOrderList workOrders={sortRows(needsAttention, WORK_ORDER_SORTS, sort)} label={label} />
                    </section>
                )}

                <section>
                    <SectionHeading title="Recent activity" href="/work-orders" />
                    {recentActivity.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-line px-4 py-4 text-sm text-subtle">
                            {workOrderCount === 0 ? "No work orders yet." : "Nothing else recently."}
                        </p>
                    ) : (
                        <WorkOrderList workOrders={sortRows(recentActivity, WORK_ORDER_SORTS, sort)} label={label} />
                    )}
                </section>
            </main>
        </div>
    );
}

function SectionHeading({ title, href }: { title: string; href?: string }) {
    return (
        <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">{title}</h2>
            {href && (
                <Link href={href} className="text-sm text-muted hover:text-foreground">
                    View all
                </Link>
            )}
        </div>
    );
}

function StatCard({
    label,
    value,
    href,
    accent = "text-foreground",
}: {
    label: string;
    value: number;
    href: string;
    accent?: string;
}) {
    return (
        <Link
            href={href}
            className="rounded-lg border border-line bg-surface p-4 transition-colors hover:border-line-hover"
        >
            <p className="text-sm text-muted">{label}</p>
            <p className={`mt-1 text-2xl font-semibold ${value > 0 ? accent : "text-faint"}`}>{value}</p>
        </Link>
    );
}

function GetStarted({ steps }: { steps: { label: string; href: string; done: boolean }[] }) {
    const doneCount = steps.filter((s) => s.done).length;

    return (
        <section className="mb-8 rounded-lg border border-line bg-surface p-4">
            <div className="mb-3 flex items-baseline justify-between">
                <h2 className="font-semibold">Get started</h2>
                <span className="text-sm text-subtle">
                    {doneCount} of {steps.length} done
                </span>
            </div>
            <ol className="grid gap-2 sm:grid-cols-2">
                {steps.map((step) => (
                    <li key={step.label}>
                        {step.done ? (
                            <span className="flex items-center gap-2 text-sm text-subtle line-through">
                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-success/50 text-xs text-success no-underline">
                                    ✓
                                </span>
                                {step.label}
                            </span>
                        ) : (
                            <Link
                                href={step.href}
                                className="flex items-center gap-2 text-sm text-foreground hover:underline"
                            >
                                <span className="h-5 w-5 shrink-0 rounded-full border border-faint" />
                                {step.label}
                            </Link>
                        )}
                    </li>
                ))}
            </ol>
        </section>
    );
}
