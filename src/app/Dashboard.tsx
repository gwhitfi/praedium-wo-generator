import Link from "next/link";
import prisma from "@/lib/prisma";
import type { Organization, User } from "@/generated/prisma/client";
import Nav from "@/components/Nav";
import { navUnreadCount } from "@/lib/notifications";
import AiPrompt from "./AiPrompt";
import PageHeader from "@/components/list/PageHeader";
import { WorkOrderList } from "@/components/WorkOrderRow";
import { CheckIcon, ChevronRightIcon } from "@/components/Icons";
import { WORK_ORDER_FILTERS, WORK_ORDER_SORTS } from "@/lib/workOrders";
import { parseSort, sortLabels, sortRows, type SearchParams } from "@/lib/sorting";
import { cardClass, pageClass, sectionTitleClass } from "@/lib/ui";

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
        unreadCount,
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
        navUnreadCount(user, organization.id),
    ]);

    const needsAttention = [...completedOrders, ...overdueOrders].slice(0, 10);
    const attentionIds = new Set(needsAttention.map((wo) => wo.id));
    const recentlyUpdated = recentOrders.filter((wo) => !attentionIds.has(wo.id)).slice(0, 5);

    const steps = [
        { label: "Add your first property", href: "/properties/new", done: propertyCount > 0 },
        { label: "Add a contractor", href: "/contacts/new", done: contractorCount > 0 },
        { label: "Set your office contact details", href: "/settings", done: !!(organization.phone || organization.email) },
        { label: "Create a work order", href: "/work-orders/new", done: workOrderCount > 0 },
    ];

    return (
        <div className="text-foreground">
            <Nav showAi={user.aiEnabled === true} unreadCount={unreadCount} />
            <main id="main" className={pageClass}>
                <PageHeader
                    title="Dashboard"
                    subtitle={organization.name}
                    actionHref="/work-orders/new"
                    actionLabel="New work order"
                />

                {steps.some((s) => !s.done) && <GetStarted steps={steps} />}

                <div className="mb-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <StatCard
                        label="Drafts"
                        hint="Not sent yet"
                        value={draftCount}
                        href="/work-orders?status=draft"
                        dot="bg-status-draft"
                    />
                    <StatCard
                        label="Active"
                        hint="Sent or in progress"
                        value={activeCount}
                        href="/work-orders?status=active"
                        dot="bg-status-sent"
                    />
                    <StatCard
                        label="To review"
                        hint="Completed, ready to close"
                        value={completedCount}
                        href="/work-orders?status=completed"
                        dot="bg-status-completed"
                    />
                    <StatCard
                        label="Overdue"
                        hint="Open past the due date"
                        value={overdueCount}
                        href="/work-orders?status=overdue"
                        dot="bg-danger"
                        alert={overdueCount > 0}
                    />
                </div>

                <section aria-labelledby="attention-title" className="mb-10">
                    <SectionHeading
                        id="attention-title"
                        title="Needs attention"
                        description="Completed work waiting to be closed out, and open work past its due date."
                    />
                    {needsAttention.length > 0 ? (
                        <WorkOrderList
                            workOrders={sortRows(needsAttention, WORK_ORDER_SORTS, sort)}
                            label={label}
                            tableLabel="Needs attention"
                        />
                    ) : (
                        <div className={`${cardClass} flex items-center gap-3 px-4 py-4 text-sm sm:px-5`}>
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
                                <CheckIcon size={16} />
                            </span>
                            <p className="text-muted">
                                <span className="font-medium text-foreground">All caught up.</span> Nothing is overdue
                                or waiting for review.
                            </p>
                        </div>
                    )}
                </section>

                <section aria-labelledby="recent-title">
                    <SectionHeading id="recent-title" title="Recently updated" href="/work-orders" />
                    {recentlyUpdated.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-line-strong/60 px-4 py-4 text-sm text-muted">
                            {workOrderCount === 0
                                ? "No work orders yet. Create one to see it here."
                                : "Nothing else changed recently."}
                        </p>
                    ) : (
                        <WorkOrderList
                            workOrders={sortRows(recentlyUpdated, WORK_ORDER_SORTS, sort)}
                            label={label}
                            tableLabel="Recently updated"
                        />
                    )}
                </section>

                {user.aiEnabled === null && <AiPrompt />}
            </main>
        </div>
    );
}

function SectionHeading({
    id,
    title,
    description,
    href,
}: {
    id: string;
    title: string;
    description?: string;
    href?: string;
}) {
    return (
        <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
            <div>
                <h2 id={id} className={sectionTitleClass}>
                    {title}
                </h2>
                {description && <p className="mt-0.5 text-sm text-subtle">{description}</p>}
            </div>
            {href && (
                <Link
                    href={href}
                    className="inline-flex items-center gap-0.5 text-sm font-medium text-accent hover:text-accent-hover"
                >
                    All work orders
                    <ChevronRightIcon size={14} />
                </Link>
            )}
        </div>
    );
}

function StatCard({
    label,
    hint,
    value,
    href,
    dot,
    alert = false,
}: {
    label: string;
    hint: string;
    value: number;
    href: string;
    dot: string;
    alert?: boolean;
}) {
    return (
        <Link
            href={href}
            className={`${cardClass} group flex flex-col p-4 transition-colors hover:border-line-hover sm:p-5 ${
                alert ? "border-danger/40" : ""
            }`}
        >
            <span className="flex items-center gap-2 text-sm font-medium text-secondary">
                <span aria-hidden className={`h-2 w-2 rounded-full ${dot}`} />
                {label}
            </span>
            <span
                className={`mt-2 text-3xl font-semibold tabular-nums tracking-tight ${
                    alert ? "text-danger" : value > 0 ? "text-foreground" : "text-subtle"
                }`}
            >
                {value}
            </span>
            <span className="mt-1 text-[0.8125rem] text-muted">{hint}</span>
        </Link>
    );
}

function GetStarted({ steps }: { steps: { label: string; href: string; done: boolean }[] }) {
    const doneCount = steps.filter((s) => s.done).length;

    return (
        <section aria-labelledby="get-started-title" className={`${cardClass} mb-8 p-4 sm:p-5`}>
            <div className="mb-3 flex items-center justify-between gap-3">
                <h2 id="get-started-title" className="font-semibold">
                    Get set up
                </h2>
                <span className="text-sm text-subtle">
                    {doneCount} of {steps.length} done
                </span>
            </div>
            <div
                role="progressbar"
                aria-label="Setup progress"
                aria-valuemin={0}
                aria-valuemax={steps.length}
                aria-valuenow={doneCount}
                className="mb-4 h-1.5 overflow-hidden rounded-full bg-line"
            >
                <div className="h-full rounded-full bg-accent" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
            </div>
            <ol className="grid gap-1 sm:grid-cols-2">
                {steps.map((step) => (
                    <li key={step.label}>
                        {step.done ? (
                            <span className="flex items-center gap-3 rounded-md px-2 py-2 text-sm text-subtle">
                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success text-background">
                                    <CheckIcon size={12} strokeWidth={3} />
                                </span>
                                <span className="line-through">{step.label}</span>
                                <span className="sr-only">(done)</span>
                            </span>
                        ) : (
                            <Link
                                href={step.href}
                                className="group flex items-center gap-3 rounded-md px-2 py-2 text-sm font-medium text-foreground hover:bg-surface-hover"
                            >
                                <span className="h-5 w-5 shrink-0 rounded-full border-2 border-line-strong" />
                                {step.label}
                                <ChevronRightIcon size={14} className="ml-auto text-subtle group-hover:text-foreground" />
                            </Link>
                        )}
                    </li>
                ))}
            </ol>
        </section>
    );
}
