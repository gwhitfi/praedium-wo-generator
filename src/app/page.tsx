import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import Dashboard from "./Dashboard";
import Landing from "./Landing";
import type { SearchParams } from "@/lib/sorting";

export default async function Home({ searchParams }: { searchParams: Promise<SearchParams> }) {
    const result = await getCurrentUser();

    if (result.state === "signed-out") {
        return <Landing />;
    }

    if (result.state === "needs-org") {
        redirect("/setup");
    }

    return <Dashboard organization={result.organization} user={result.user} params={await searchParams} />;
}
