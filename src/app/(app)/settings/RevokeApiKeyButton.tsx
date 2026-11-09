"use client";

import { useState } from "react";
import { revokeApiKey } from "./actions";
import { Button } from "@/components/Button";

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
                <div className="flex max-w-xs flex-col items-end gap-2 text-right">
                    <span className="text-sm text-secondary">Revoke it? Assistants using it stop working.</span>
                    <div className="flex gap-2">
                        <Button size="sm" onClick={() => setConfirming(false)} disabled={pending}>
                            Go back
                        </Button>
                        <Button size="sm" variant="danger" onClick={revoke} pending={pending} pendingLabel="Revoking…">
                            Revoke
                        </Button>
                    </div>
                </div>
            ) : (
                <Button size="sm" variant="danger-ghost" aria-label={`Revoke ${name}`} onClick={() => setConfirming(true)}>
                    Revoke
                </Button>
            )}
            {error && (
                <span role="alert" className="text-sm text-danger">
                    {error}
                </span>
            )}
        </div>
    );
}
