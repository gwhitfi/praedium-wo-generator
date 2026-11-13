"use client";

import { useState } from "react";
import { useClerk } from "@clerk/nextjs";
import { Button } from "@/components/Button";
import { restoreOrganization } from "./actions";

// A full page load, not router.push, so every part of the page starts from the new session.
function reloadAt(path: string): void {
    window.location.assign(path);
}

// Restores an organization scheduled for deletion, then makes it the active one and reloads at the dashboard.
export function RestoreOrganizationButton({
    clerkOrgId,
    name,
}: {
    clerkOrgId: string;
    name: string;
}): React.ReactElement {
    const clerk = useClerk();
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function restore() {
        setPending(true);
        setError(null);
        let result;
        try {
            result = await restoreOrganization(clerkOrgId);
        } catch {
            result = { ok: false as const, error: "Couldn't restore the organization. Try again." };
        }
        if (!result.ok) {
            setError(result.error);
            setPending(false);
            return;
        }
        try {
            await clerk.setActive({ organization: clerkOrgId });
        } catch (error) {
            console.error("Couldn't make the restored organization active", error);
        }
        reloadAt("/");
    }

    return (
        <div className="flex flex-col items-start gap-2">
            <Button
                size="sm"
                onClick={restore}
                pending={pending}
                pendingLabel="Restoring…"
                aria-label={`Restore ${name}`}
            >
                Restore
            </Button>
            {error && (
                <p role="alert" className="text-sm text-danger">
                    {error}
                </p>
            )}
        </div>
    );
}
