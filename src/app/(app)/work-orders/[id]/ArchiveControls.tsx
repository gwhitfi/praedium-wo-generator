"use client";

import { useState } from "react";
import { archiveWorkOrder, restoreWorkOrder } from "../actions";
import { Button } from "@/components/Button";
import { useToast } from "@/components/Toaster";

export default function ArchiveControls({
    workOrderId,
    archived,
    willCancel = false,
    inHouse = false,
    contractorName = null,
}: {
    workOrderId: string;
    archived: boolean;
    willCancel?: boolean;
    // In-house work orders have no contractor to email and no link.
    inHouse?: boolean;
    contractorName?: string | null;
}): React.ReactElement {
    const toast = useToast();
    const [confirming, setConfirming] = useState(false);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function run(
        fn: () => Promise<string | null>,
        success: string,
        undo?: { label: string; onClick: () => Promise<void> },
    ) {
        setPending(true);
        setError(null);
        try {
            const failure = await fn();
            if (failure) {
                setError(failure);
            } else {
                setConfirming(false);
                toast(success, "success", undo);
            }
        } catch {
            setError("Something went wrong. Try again.");
        } finally {
            setPending(false);
        }
    }

    if (archived) {
        return (
            <div className="flex flex-col items-end gap-1">
                <Button
                    size="sm"
                    pending={pending}
                    pendingLabel="Restoring…"
                    onClick={() =>
                        run(async () => {
                            const res = await restoreWorkOrder(workOrderId);
                            return res.ok ? null : res.error;
                        }, "Restored.")
                    }
                >
                    Restore
                </Button>
                {error && (
                    <span role="alert" className="text-sm text-danger">
                        {error}
                    </span>
                )}
            </div>
        );
    }

    if (!confirming) {
        return (
            <Button size="sm" onClick={() => setConfirming(true)}>
                Archive
            </Button>
        );
    }

    return (
        <div className="w-full rounded-lg border border-line-strong/70 bg-background/40 p-3 sm:w-80">
            <p className="text-sm font-medium text-foreground">Archive this work order?</p>
            <p className="mt-1 text-sm text-muted">
                {inHouse
                    ? willCancel
                        ? "It will be cancelled and hidden from lists."
                        : "It will be hidden from lists. You can restore it later."
                    : willCancel
                      ? `It will be cancelled, ${contractorName ?? "the contractor"} will be emailed, and their link will stop working.`
                      : "It will be hidden from lists and the contractor link will stop working. You can restore it later."}
            </p>
            {error && (
                <p role="alert" className="mt-2 text-sm text-danger">
                    {error}
                </p>
            )}
            <div className="mt-3 flex justify-end gap-2">
                <Button size="sm" onClick={() => setConfirming(false)} disabled={pending}>
                    Go back
                </Button>
                <Button
                    size="sm"
                    variant="danger"
                    pending={pending}
                    pendingLabel="Archiving…"
                    onClick={() =>
                        run(
                            async () => {
                                await archiveWorkOrder(workOrderId);
                                return null;
                            },
                            willCancel ? "Archived and cancelled." : "Archived.",
                            // Restoring brings back an archived work order; one that was cancelled stays cancelled,
                            // so then the button says what it does instead of "Undo".
                            {
                                label: willCancel ? "Restore to list" : "Undo",
                                onClick: async () => {
                                    const res = await restoreWorkOrder(workOrderId);
                                    toast(
                                        !res.ok
                                            ? res.error
                                            : willCancel
                                              ? "Back in the list, still cancelled. Reopen it to send it again."
                                              : "Restored.",
                                        res.ok ? "success" : "error",
                                    );
                                },
                            },
                        )
                    }
                >
                    Archive
                </Button>
            </div>
        </div>
    );
}
