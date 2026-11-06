"use client";

import { useState } from "react";
import { signOutContractorDevices } from "../actions";

const outlineButton =
    "shrink-0 rounded-md border border-line-strong px-4 py-2 text-sm text-foreground hover:bg-surface-hover hover:cursor-pointer disabled:opacity-40 disabled:hover:cursor-not-allowed";

export function SignOutDevicesButton({ contactId }: { contactId: string }): React.ReactElement {
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSignOut() {
        if (
            !window.confirm(
                "Sign out this contractor on every device? They'll verify again from their next work order.",
            )
        ) {
            return;
        }
        setPending(true);
        setError(null);
        try {
            const res = await signOutContractorDevices(contactId);
            if (!res.ok) setError(res.error);
        } catch {
            setError("Could not sign out. Try again.");
        } finally {
            setPending(false);
        }
    }

    return (
        <>
            <button type="button" onClick={handleSignOut} disabled={pending} className={outlineButton}>
                {pending ? "Signing out..." : "Sign out all devices"}
            </button>
            {error && <span className="text-sm text-danger">{error}</span>}
        </>
    );
}
