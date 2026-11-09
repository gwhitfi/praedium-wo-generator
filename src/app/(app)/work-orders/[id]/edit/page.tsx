import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { IN_HOUSE } from "@/lib/defaults";
import PageHeader from "@/components/list/PageHeader";
import { readingClass, taskPageClass } from "@/lib/ui";
import WorkOrderForm from "../../new/WorkOrderForm";
import { updateWorkOrder } from "../../actions";

export const metadata: Metadata = { title: "Edit work order" };

export default async function EditWorkOrder({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const result = await getCurrentUser();

    if (result.state === "signed-out") {
        redirect("/sign-in");
    }

    if (result.state === "needs-org") {
        redirect("/setup");
    }

    const organizationId = result.organization.id;

    const workOrder = await prisma.workOrder.findFirst({
        where: { id, organizationId },
        include: {
            property: {
                include: { units: { where: { archived: false }, orderBy: { sortOrder: "asc" } } },
            },
        },
    });

    if (!workOrder) notFound();

    if (workOrder.archived || !["DRAFT", "SENT", "IN_PROGRESS"].includes(workOrder.status)) {
        redirect(`/work-orders/${id}`);
    }

    const [contractors, tenants] = await Promise.all([
        prisma.contact.findMany({
            where: { organizationId, archived: false, contactType: { in: ["CONTRACTOR", "OTHER"] } },
            // In-house staff first, then favorites.
            orderBy: [{ inHouse: "desc" }, { favorite: "desc" }, { displayName: "asc" }],
        }),
        prisma.contact.findMany({
            where: {
                organizationId,
                archived: false,
                contactType: "TENANT",
                unit: { propertyId: workOrder.propertyId },
            },
        }),
    ]);

    return (
        <main id="main" className={taskPageClass}>
            <div className={readingClass}>
                <PageHeader
                    title="Edit details"
                    subtitle={`#${workOrder.jobNumber} · ${workOrder.title ?? "Untitled work order"}`}
                    back={{ href: `/work-orders/${workOrder.id}`, label: "Back to the work order" }}
                />
                <WorkOrderForm
                    properties={[workOrder.property]}
                    contractors={contractors}
                    tenants={tenants}
                    initial={{
                        title: workOrder.title ?? "",
                        propertyId: workOrder.propertyId,
                        unitId: workOrder.unitId ?? "",
                        contractorId: workOrder.inHouse ? IN_HOUSE : (workOrder.contractorId ?? ""),
                        notes: workOrder.notes ?? "",
                        dueDate: workOrder.dueDate ? workOrder.dueDate.toISOString().slice(0, 10) : "",
                        notifyTenant: workOrder.notifyTenant,
                    }}
                    action={updateWorkOrder.bind(null, workOrder.id)}
                    submitLabel="Save changes"
                    cancelHref={`/work-orders/${workOrder.id}`}
                    lockProperty
                    sent={workOrder.status !== "DRAFT"}
                />
            </div>
        </main>
    );
}
