import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import WorkOrderForm from "../../new/WorkOrderForm";
import { updateWorkOrder } from "../../actions";

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
            orderBy: [{ favorite: "desc" }, { displayName: "asc" }],
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
        <main className="mx-auto max-w-5xl px-4 py-10 text-foreground">
            <h1 className="text-2xl font-semibold mb-6">Edit Work Order</h1>
            <WorkOrderForm
                properties={[workOrder.property]}
                contractors={contractors}
                tenants={tenants}
                initial={{
                    title: workOrder.title ?? "",
                    propertyId: workOrder.propertyId,
                    unitId: workOrder.unitId ?? "",
                    contractorId: workOrder.contractorId ?? "",
                    notes: workOrder.notes ?? "",
                    dueDate: workOrder.dueDate ? workOrder.dueDate.toISOString().slice(0, 10) : "",
                    notifyTenant: workOrder.notifyTenant,
                }}
                action={updateWorkOrder.bind(null, workOrder.id)}
                submitLabel="Save changes"
                lockProperty
                sent={workOrder.status !== "DRAFT"}
            />
            <Link
                href={`/work-orders/${workOrder.id}`}
                className="mt-4 inline-block text-sm text-muted hover:text-foreground"
            >
                Cancel
            </Link>
        </main>
    );
}
