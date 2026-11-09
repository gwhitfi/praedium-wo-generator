import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { STATUS_DOTS, WORK_ORDER_STATUS_LABELS } from "@/lib/defaults";
import { isVerifiedFor } from "@/lib/contractorAccess";
import {
    CONTRACTOR_LIST_STATUSES,
    canLookup,
    getContractorWorkOrder,
    listContractorWorkOrders,
    maskEmail,
    type ContractorWorkOrder,
} from "@/lib/contractorWorkOrders";
import { WorkOrderList, type WorkOrderWithPlace } from "@/components/WorkOrderRow";
import ThemeToggle from "@/components/ThemeToggle";
import { BackLink } from "@/components/list/PageHeader";
import { openInput } from "../schemas";

export const metadata: Metadata = {
    title: "Your work orders",
    robots: { index: false, follow: false },
    referrer: "no-referrer",
};

export default async function ContractorWorkOrderList({
    params,
}: {
    params: Promise<{ token: string }>;
}): Promise<React.ReactElement> {
    const { token } = await params;
    if (!openInput.safeParse({ token }).success) notFound();
    const workOrder = await getContractorWorkOrder(token);
    if (!workOrder) notFound();

    const orgName = workOrder.organization.name;

    return (
        <main id="main" className="mx-auto max-w-5xl px-4 pt-5 pb-12 text-foreground sm:pt-8">
            {/* Standard light/dark only: the theme script never applies Settings palettes on /wo/ pages. */}
            <div className="mb-4 flex items-center justify-between gap-3">
                <p className="min-w-0 truncate text-sm font-medium text-muted">{orgName}</p>
                <div className="-mr-2 shrink-0 print:hidden">
                    <ThemeToggle />
                </div>
            </div>

            <BackLink href={`/wo/${token}`} label={`Back to #${workOrder.jobNumber}`} />
            <h1 className="mb-2 text-2xl font-semibold tracking-tight">Your work orders</h1>

            {canLookup(workOrder) ? (
                <VerifiedList token={token} workOrder={workOrder} />
            ) : workOrder.contractorEmail ? (
                <p className="text-sm text-muted">
                    This work order is closed, so it can&apos;t be used to look up others. Open the link from one of
                    your current work orders instead.
                </p>
            ) : (
                <p className="text-sm text-muted">
                    This work order has no contractor email on file. Ask {orgName} to add your email to get a list of
                    your work orders.
                </p>
            )}

            <p className="mt-10 text-center text-xs text-subtle print:hidden">
                <Link href="/privacy" className="underline hover:text-foreground">
                    Privacy Policy
                </Link>
            </p>
        </main>
    );
}

// The list, once this browser is verified for the work order's contractor email.
async function VerifiedList({
    token,
    workOrder,
}: {
    token: string;
    workOrder: ContractorWorkOrder;
}): Promise<React.ReactElement> {
    if (!(await isVerifiedFor(workOrder))) {
        return (
            <p className="text-sm text-muted">
                Verify on the{" "}
                <Link href={`/wo/${token}`} className="underline hover:text-foreground">
                    work order page
                </Link>{" "}
                first.
            </p>
        );
    }

    const workOrders = await listContractorWorkOrders(workOrder);
    const orgName = workOrder.organization.name;
    const noun = workOrders.length === 1 ? "work order" : "work orders";

    return (
        <>
            <p className="text-sm text-subtle">
                Work orders sent to{" "}
                <span className="text-foreground">{maskEmail(workOrder.contractorEmail ?? "")}</span> by {orgName}.{" "}
                {workOrders.length} {noun}.
            </p>
            <div className="mt-6 flex flex-col gap-8">
                {workOrders.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-line px-4 py-12 text-center">
                        <p className="text-sm text-muted">
                            No current work orders for that email address. Only work orders {orgName} sent to this email
                            are listed. Contact the office if something is missing.
                        </p>
                    </div>
                ) : (
                    <StatusSections workOrders={workOrders} />
                )}
            </div>
        </>
    );
}

// One section per status, in CONTRACTOR_LIST_STATUSES order. Empty sections are left out.
function StatusSections({ workOrders }: { workOrders: WorkOrderWithPlace[] }): React.ReactElement {
    return (
        <>
            {CONTRACTOR_LIST_STATUSES.map((status) => {
                const rows = workOrders.filter((wo) => wo.status === status);
                if (rows.length === 0) return null;

                return (
                    <section key={status}>
                        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
                            <span aria-hidden className={`h-2 w-2 rounded-full ${STATUS_DOTS[status]}`} />
                            {WORK_ORDER_STATUS_LABELS[status]}
                            <span className="text-sm font-normal text-subtle">{rows.length}</span>
                        </h2>
                        <WorkOrderList
                            workOrders={rows}
                            hideContractor
                            hideStatus
                            href={(wo) => `/wo/${wo.publicToken}`}
                            tableLabel={`${WORK_ORDER_STATUS_LABELS[status]} work orders`}
                        />
                    </section>
                );
            })}
        </>
    );
}
