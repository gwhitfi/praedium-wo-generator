import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import PageHeader from "@/components/list/PageHeader";
import { readingClass, taskPageClass } from "@/lib/ui";
import PropertyForm from "./PropertyForm";

export const metadata: Metadata = { title: "New property" };

export default async function NewProperty({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
    const result = await getCurrentUser();

    if (result.state === "signed-out") {
        redirect("/sign-in");
    }

    if (result.state === "needs-org") {
        redirect("/setup");
    }

    const { returnTo } = await searchParams;
    const fromWorkOrder = returnTo === "/work-orders/new";
    const back = fromWorkOrder
        ? { href: "/work-orders/new", label: "Back to the new work order" }
        : { href: "/properties", label: "Properties" };

    return (
        <main id="main" className={taskPageClass}>
            <div className={readingClass}>
                <PageHeader
                    title="New property"
                    subtitle={
                        fromWorkOrder
                            ? "Save it and you'll go straight back to your work order, with this property picked."
                            : "A house, a building or a commercial space you manage."
                    }
                    back={back}
                />
                <PropertyForm returnTo={fromWorkOrder ? returnTo : undefined} cancelHref={back.href} />
            </div>
        </main>
    );
}
