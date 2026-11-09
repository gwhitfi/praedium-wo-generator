import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import PageHeader from "@/components/list/PageHeader";
import Steps from "@/components/Steps";
import { readingClass, taskPageClass } from "@/lib/ui";
import WorkOrderForm from "./WorkOrderForm";

export const metadata: Metadata = { title: "New work order" };

export default async function NewWorkOrder({
    searchParams,
}: {
    searchParams: Promise<{ propertyId?: string; contractorId?: string }>;
}) {
    const result = await getCurrentUser();

    if (result.state === "signed-out") {
        redirect("/sign-in");
    }

    if (result.state === "needs-org") {
        redirect("/setup");
    }

    const properties = await prisma.property.findMany({
        where: { organizationId: result.organization.id, archived: false },
        orderBy: { displayName: "asc" },
        include: {
            units: {
                where: { archived: false },
                orderBy: { sortOrder: "asc" },
            },
        },
    });

    const contacts = await prisma.contact.findMany({
        where: {
            organizationId: result.organization.id,
            archived: false,
            contactType: { in: ["CONTRACTOR", "OTHER"] },
        },
        // In-house staff first, then favorites.
        orderBy: [{ inHouse: "desc" }, { favorite: "desc" }, { displayName: "asc" }],
    });

    const tenants = await prisma.contact.findMany({
        where: {
            organizationId: result.organization.id,
            archived: false,
            contactType: "TENANT",
        },
    });

    const { propertyId, contractorId } = await searchParams;
    const defaultPropertyId = properties.some((p) => p.id === propertyId) ? propertyId : undefined;
    // Only a contractor from this organization's list can be picked in advance.
    const defaultContractorId = contacts.some((c) => c.id === contractorId) ? contractorId : undefined;

    return (
        <main id="main" className={taskPageClass}>
            <div className={readingClass}>
                <PageHeader
                    title="New work order"
                    subtitle="Start with the basics. Next you'll list the work room by room, then send it."
                    back={{ href: "/work-orders", label: "Work orders" }}
                />
                <Steps steps={["Details", "The work", "Send"]} current={1} />
                <WorkOrderForm
                    properties={properties}
                    contractors={contacts}
                    tenants={tenants}
                    defaultPropertyId={defaultPropertyId}
                    defaultContractorId={defaultContractorId}
                    cancelHref="/work-orders"
                />
            </div>
        </main>
    );
}
