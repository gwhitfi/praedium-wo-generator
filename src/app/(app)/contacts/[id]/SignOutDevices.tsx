"use client";

import { useState } from "react";
import { signOutContractorDevices } from "../actions";
import { Button } from "@/components/Button";
import { useToast } from "@/components/Toaster";

// Signs the contractor out of every device they verified on. Asks in place first.
export function SignOutDevicesButton({ contactId }: { contactId: string }): React.ReactElement {
    const toast = useToast();
    const [confirming, setConfirming] = useState(false);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSignOut() {
        setPending(true);
        setError(null);
        try {
            const res = await signOutContractorDevices(contactId);
            if (res.ok) {
                setConfirming(false);
                toast("Signed out on every device.");
            } else {
                setError(res.error);
            }
        } catch {
            setError("Could not sign out. Try again.");
        } finally {
            setPending(false);
        }
    }

    return (
        <div className="flex flex-col gap-2">
            {confirming ? (
                <div className="rounded-lg border border-line-strong/70 bg-background/40 p-3">
                    <p className="text-sm text-foreground">
                        Sign them out everywhere? They&apos;ll verify again from their next work order.
                    </p>
                    <div className="mt-2 flex justify-end gap-2">
                        <Button size="sm" onClick={() => setConfirming(false)} disabled={pending}>
                            Go back
                        </Button>
                        <Button size="sm" variant="danger" onClick={handleSignOut} pending={pending} pendingLabel="Signing out…">
                            Sign out
                        </Button>
                    </div>
                </div>
            ) : (
                <Button size="sm" onClick={() => setConfirming(true)}>
                    Sign out all devices
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
