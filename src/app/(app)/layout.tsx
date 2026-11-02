import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import Nav from "@/components/Nav";
import React from "react";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
    const result = await getCurrentUser();
    if (result.state === "signed-out") redirect("/sign-in");
    if (result.state === "needs-org") redirect("/setup");

    return (
        <div className="min-h-screen text-foreground">
            <Nav showAi={result.user.aiEnabled !== false} />
            {children}
        </div>
    );
}
