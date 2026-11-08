"use client";

import { useState } from "react";
import { archiveWorkOrder, restoreWorkOrder } from "../actions";

const buttonClass =
    "shrink-0 rounded-md border border-line-strong px-4 py-2 text-sm text-foreground hover:bg-surface-hover hover:cursor-pointer disabled:opacity-40 disabled:hover:cursor-not-allowed";

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
}) {
    const [confirming, setConfirming] = useState(false);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function run(fn: () => Promise<void>) {
        setPending(true);
        setError(null);
        try {
            await fn();
        } catch {
            setError("Something went wrong. Try again.");
        } finally {
            setPending(false);
            setConfirming(false);
        }
    }

    if (archived) {
        return (
            <>
                <button
                    className={buttonClass}
                    onClick={() =>
                        run(async () => {
                            const res = await restoreWorkOrder(workOrderId);
                            if (!res.ok) setError(res.error);
                        })
                    }
                    disabled={pending}
                >
                    {pending ? "Restoring..." : "Restore"}
                </button>
                {error && <span className="text-sm text-danger">{error}</span>}
            </>
        );
    }

    return (
        <>
            {confirming ? (
                <span className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-secondary">
                        {inHouse
                            ? willCancel
                                ? "Archive this work order? It will be cancelled and hidden from lists."
                                : "Archive this work order? It will be hidden from lists."
                            : willCancel
                              ? `Archive this work order? It will be cancelled, ${contractorName ?? "the contractor"} will be emailed, and their link will stop working.`
                              : "Archive this work order? It will be hidden from lists and the contractor link will stop working."}
                    </span>
                    <button
                        className="text-danger hover:text-danger/80 hover:cursor-pointer disabled:opacity-40"
                        onClick={() => run(() => archiveWorkOrder(workOrderId))}
                        disabled={pending}
                    >
                        {pending ? "Archiving..." : "Yes, archive"}
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
                    className="shrink-0 rounded-md px-4 py-2 text-sm text-subtle hover:text-danger hover:cursor-pointer"
                    onClick={() => setConfirming(true)}
                >
                    Archive
                </button>
            )}
            {error && <span className="w-full text-sm text-danger">{error}</span>}
        </>
    );
}
