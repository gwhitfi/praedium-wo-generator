import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import PropertyForm from "./PropertyForm";

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

    return (
        <main className="mx-auto max-w-5xl px-4 py-10 text-foreground">
            <h1 className="text-2xl font-semibold mb-6">Create property</h1>
            <PropertyForm returnTo={fromWorkOrder ? returnTo : undefined} />
            <Link
                href={fromWorkOrder ? "/work-orders/new" : "/properties"}
                className="text-sm text-muted hover:text-foreground"
            >
                Cancel
            </Link>
        </main>
    );
}
