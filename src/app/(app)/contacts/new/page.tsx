import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import PageHeader from "@/components/list/PageHeader";
import { readingClass, taskPageClass } from "@/lib/ui";
import ContactForm from "./ContactForm";
import prisma from "@/lib/prisma";

export const metadata: Metadata = { title: "New contact" };

export default async function NewContact({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
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

    // Opened from the work order form's "Add a new contractor": go back there afterwards, with them picked.
    const { returnTo } = await searchParams;
    const fromWorkOrder = returnTo === "/work-orders/new";
    const back = fromWorkOrder
        ? { href: "/work-orders/new", label: "Back to the new work order" }
        : { href: "/contacts", label: "Contacts" };

    return (
        <main id="main" className={taskPageClass}>
            <div className={readingClass}>
                <PageHeader
                    title={fromWorkOrder ? "New contractor" : "New contact"}
                    subtitle={
                        fromWorkOrder
                            ? "Save them and you'll go straight back to your work order, with them picked."
                            : "A contractor you send work to, a tenant, or anyone else you deal with."
                    }
                    back={back}
                />
                <ContactForm
                    properties={properties}
                    cancelHref={back.href}
                    returnTo={fromWorkOrder ? returnTo : undefined}
                />
            </div>
        </main>
    );
}
