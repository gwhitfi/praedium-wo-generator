import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { formatPhone } from "@/lib/phone";
import ContactForm from "../../new/ContactForm";
import { updateContact } from "../../actions";

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
        <main className="mx-auto max-w-5xl px-4 py-10 text-foreground">
            <h1 className="text-2xl font-semibold mb-6">Edit contact</h1>
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
                lockType={workOrderCount > 0}
            />
            <Link
                href={`/contacts/${contact.id}`}
                className="mt-4 inline-block text-sm text-muted hover:text-foreground"
            >
                Cancel
            </Link>
        </main>
    );
}
