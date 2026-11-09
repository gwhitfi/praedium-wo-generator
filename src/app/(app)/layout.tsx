import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import Nav from "@/components/Nav";
import { navUnreadCount } from "@/lib/notifications";
import React from "react";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
    const result = await getCurrentUser();
    if (result.state === "signed-out") redirect("/sign-in");
    if (result.state === "needs-org") redirect("/setup");
    const unreadCount = await navUnreadCount(result.user, result.organization.id);

    return (
        <div className="min-h-screen text-foreground">
            <Nav showAi={result.user.aiEnabled === true} unreadCount={unreadCount} />
            {children}
        </div>
    );
}
