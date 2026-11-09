import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import PageHeader from "@/components/list/PageHeader";
import { ButtonLink } from "@/components/Button";
import { SparklesIcon } from "@/components/Icons";
import { readingClass, taskPageClass } from "@/lib/ui";
import BotForm from "./BotForm";

export const metadata: Metadata = { title: "Draft with AI" };

export default async function NewWorkOrderWithAi() {
    const result = await getCurrentUser();
    if (result.state === "signed-out") redirect("/sign-in");
    if (result.state === "needs-org") redirect("/setup");
    // "Turn off Praedium Bot" in Settings turns the tool off, not just its nav button.
    if (result.user.aiEnabled !== true) redirect("/work-orders/new");
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
                favorite: true,
                units: {
                    where: { archived: false },
                    orderBy: { sortOrder: "asc" },
                    select: { id: true, name: true, isDefault: true },
                },
            },
        }),
        prisma.contact.findMany({
            where: { organizationId, archived: false, contactType: { in: ["CONTRACTOR", "OTHER"] } },
            orderBy: [{ inHouse: "desc" }, { favorite: "desc" }, { displayName: "asc" }],
            select: {
                id: true,
                displayName: true,
                firstName: true,
                lastName: true,
                company: true,
                inHouse: true,
                favorite: true,
            },
        }),
    ]);

    return (
        <main id="main" className={taskPageClass}>
            <div className={readingClass}>
                <PageHeader
                    back={{ href: "/work-orders", label: "Work orders" }}
                    eyebrow={
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-accent">
                            <SparklesIcon size={14} />
                            Praedium Bot
                        </span>
                    }
                    title="Draft a work order with AI"
                    subtitle="Describe the job in your own words. You'll review everything before a draft is created."
                    actions={
                        <ButtonLink href="/work-orders/new" size="sm">
                            Use the form instead
                        </ButtonLink>
                    }
                />
                <BotForm properties={properties} contractors={contractors} />
            </div>
        </main>
    );
}
