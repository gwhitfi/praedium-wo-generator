"use client";

import { useState } from "react";
import { revokeApiKey } from "./actions";

// Asks before revoking, like ArchiveControls: a revoked key can't be restored.
export default function RevokeApiKeyButton({ id, name }: { id: string; name: string }): React.ReactElement {
    const [confirming, setConfirming] = useState(false);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function revoke() {
        setPending(true);
        setError(null);
        try {
            const formData = new FormData();
            formData.set("id", id);
            await revokeApiKey(formData);
        } catch {
            setError("Something went wrong. Try again.");
            setPending(false);
            setConfirming(false);
        }
    }

    return (
        <div className="flex shrink-0 flex-col items-end gap-1">
            {confirming ? (
                <span className="flex flex-wrap items-center justify-end gap-2 text-sm">
                    <span className="text-secondary">Revoke this key? Assistants using it will stop working.</span>
                    <button
                        className="text-danger hover:text-danger/80 hover:cursor-pointer disabled:opacity-40"
                        onClick={revoke}
                        disabled={pending}
                    >
                        {pending ? "Revoking..." : "Yes, revoke"}
                    </button>
                    <button
                        className="text-subtle hover:text-foreground hover:cursor-pointer"
                        onClick={() => setConfirming(false)}
                        disabled={pending}
                    >
                        Go back
                    </button>
                </span>
            ) : (
                <button
                    aria-label={`Revoke ${name}`}
                    className="rounded-md px-3 py-1.5 text-sm text-subtle hover:text-danger hover:cursor-pointer"
                    onClick={() => setConfirming(true)}
                >
                    Revoke
                </button>
            )}
            {error && <span className="text-sm text-danger">{error}</span>}
        </div>
    );
}
