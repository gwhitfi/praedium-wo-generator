import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import PageHeader from "@/components/list/PageHeader";
import { readingClass, taskPageClass } from "@/lib/ui";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { formatPhone } from "@/lib/phone";
import ContactForm from "../../new/ContactForm";
import { updateContact } from "../../actions";

export const metadata: Metadata = { title: "Edit contact" };

export default async function EditContact({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const result = await getCurrentUser();

    if (result.state === "signed-out") {
        redirect("/sign-in");
    }

    if (result.state === "needs-org") {
        redirect("/setup");
    }

    const organizationId = result.organization.id;

    const [contact, properties, workOrderCount] = await Promise.all([
        prisma.contact.findFirst({
            where: { id, organizationId },
            include: { unit: { include: { property: true } } },
        }),
        prisma.property.findMany({
            where: { organizationId, archived: false },
            orderBy: { displayName: "asc" },
            include: {
                units: {
                    where: { archived: false },
                    orderBy: { sortOrder: "asc" },
                },
            },
        }),
        prisma.workOrder.count({
            where: { organizationId, OR: [{ contractorId: id }, { tenantId: id }] },
        }),
    ]);

    if (!contact) notFound();
    if (contact.archived) redirect(`/contacts/${id}`);

    const unit = contact.unit && !contact.unit.archived && !contact.unit.property.archived ? contact.unit : null;

    return (
        <main id="main" className={taskPageClass}>
            <div className={readingClass}>
                <PageHeader
                    title="Edit contact"
                    subtitle={contact.displayName}
                    back={{ href: `/contacts/${contact.id}`, label: "Back to the contact" }}
                />
                <ContactForm
                    properties={properties}
                    initial={{
                        contactType: contact.contactType,
                        displayName: contact.displayName,
                        firstName: contact.firstName ?? "",
                        lastName: contact.lastName ?? "",
                        company: contact.company ?? "",
                        addressLine1: contact.addressLine1 ?? "",
                        addressLine2: contact.addressLine2 ?? "",
                        city: contact.city ?? "",
                        state: contact.state?.trim().toUpperCase() ?? "",
                        zipCode: contact.zipCode ?? "",
                        phone: contact.phone ? formatPhone(contact.phone) : "",
                        email: contact.email ?? "",
                        notes: contact.notes ?? "",
                        propertyId: unit?.propertyId ?? "",
                        unitId: unit?.id ?? "",
                        inHouse: contact.inHouse,
                    }}
                    action={updateContact.bind(null, contact.id)}
                    submitLabel="Save changes"
                    cancelHref={`/contacts/${contact.id}`}
                    lockType={workOrderCount > 0}
                />
            </div>
        </main>
    );
}
