import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import PageHeader from "@/components/list/PageHeader";
import { readingClass, taskPageClass } from "@/lib/ui";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import PropertyForm from "../../new/PropertyForm";
import { updateProperty } from "../../actions";

export const metadata: Metadata = { title: "Edit property" };

export default async function EditProperty({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const result = await getCurrentUser();

    if (result.state === "signed-out") {
        redirect("/sign-in");
    }

    if (result.state === "needs-org") {
        redirect("/setup");
    }

    const property = await prisma.property.findFirst({
        where: { id, organizationId: result.organization.id },
    });

    if (!property) notFound();
    if (property.archived) redirect(`/properties/${id}`);

    return (
        <main id="main" className={taskPageClass}>
            <div className={readingClass}>
                <PageHeader
                    title="Edit property"
                    subtitle={`${property.displayName}. Units are managed on the property page.`}
                    back={{ href: `/properties/${property.id}`, label: "Back to the property" }}
                />
                <PropertyForm
                    initial={{
                        displayName: property.displayName,
                        propertyType: property.propertyType,
                        addressLine1: property.addressLine1,
                        addressLine2: property.addressLine2 ?? "",
                        city: property.city,
                        state: property.state.trim().toUpperCase(),
                        zipCode: property.zipCode,
                        notes: property.notes ?? "",
                    }}
                    action={updateProperty.bind(null, property.id)}
                    submitLabel="Save changes"
                    cancelHref={`/properties/${property.id}`}
                />
            </div>
        </main>
    );
}
