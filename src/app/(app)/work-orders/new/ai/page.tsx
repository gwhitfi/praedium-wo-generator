import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import BotForm from "./BotForm";

export default async function NewWorkOrderWithAi() {
    const result = await getCurrentUser();
    if (result.state === "signed-out") redirect("/sign-in");
    if (result.state === "needs-org") redirect("/setup");
    const organizationId = result.organization.id;

    // For the review screen's dropdowns. Only names and addresses: contact details stay on the server.
    const [properties, contractors] = await Promise.all([
        prisma.property.findMany({
            where: { organizationId, archived: false },
            orderBy: { displayName: "asc" },
            select: {
                id: true,
                displayName: true,
                addressLine1: true,
                city: true,
                units: {
                    where: { archived: false },
                    orderBy: { sortOrder: "asc" },
                    select: { id: true, name: true, isDefault: true },
                },
            },
        }),
        prisma.contact.findMany({
            where: { organizationId, archived: false, contactType: { in: ["CONTRACTOR", "OTHER"] } },
            orderBy: [{ favorite: "desc" }, { displayName: "asc" }],
            select: { id: true, displayName: true, firstName: true, lastName: true, company: true },
        }),
    ]);

    return (
        <main className="mx-auto max-w-3xl px-4 py-10 text-foreground">
            <h1 className="mb-2 text-2xl font-semibold">Describe your work order</h1>
            <p className="mb-6 text-sm text-muted">
                Be sure you include the property address and a contractor&apos;s name. Do not include any phone numbers
                or tenant information. Photos will need to be added manually in a later step.
            </p>
            <BotForm properties={properties} contractors={contractors} />
            <Link href="/work-orders" className="mt-6 inline-block text-sm text-muted hover:text-foreground">
                Cancel
            </Link>
        </main>
    );
}
