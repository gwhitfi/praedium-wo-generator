import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import WorkOrderForm from "./WorkOrderForm";
export default async function NewWorkOrder({ searchParams }: { searchParams: Promise<{ propertyId?: string }> }) {
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

    const { propertyId } = await searchParams;
    const defaultPropertyId = properties.some((p) => p.id === propertyId) ? propertyId : undefined;

    return (
        <main className="mx-auto max-w-5xl px-4 py-10 text-foreground">
            <h1 className="text-2xl font-semibold mb-6">Create work order</h1>
            <WorkOrderForm
                properties={properties}
                contractors={contacts}
                tenants={tenants}
                defaultPropertyId={defaultPropertyId}
            />
            <Link href="/work-orders" className="text-sm text-muted hover:text-foreground">
                Cancel
            </Link>
        </main>
    );
}
