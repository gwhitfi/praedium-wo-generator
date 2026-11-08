"use client";

import { useRef, useState } from "react";
import { archiveProperty, restoreProperty } from "../actions";

const outlineButton =
    "shrink-0 rounded-md border border-line-strong px-4 py-2 text-sm text-foreground hover:bg-surface-hover hover:cursor-pointer disabled:opacity-40 disabled:hover:cursor-not-allowed";

export function ArchivePropertyButton({
    propertyId,
    propertyName,
    openCount,
    completedCount,
}: {
    propertyId: string;
    propertyName: string;
    openCount: number;
    completedCount: number;
}) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleArchive() {
        setPending(true);
        setError(null);
        try {
            // Redirects to /properties on success.
            await archiveProperty(propertyId);
        } catch {
            setError("Could not archive the property. Try again.");
            setPending(false);
        }
    }

    const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

    return (
        <>
            <button
                type="button"
                onClick={() => dialogRef.current?.showModal()}
                className="shrink-0 rounded-md px-4 py-2 text-sm text-subtle hover:text-danger hover:cursor-pointer"
            >
                Archive property
            </button>

            <dialog
                ref={dialogRef}
                onClick={(e) => {
                    // Clicking the backdrop (the dialog element itself) closes it.
                    if (e.target === dialogRef.current && !pending) dialogRef.current.close();
                }}
                className="m-auto w-[calc(100%-2rem)] max-w-md rounded-lg border border-line-strong bg-surface p-0 text-foreground backdrop:bg-black/70"
            >
                <div className="p-5">
                    <h2 className="mb-2 text-lg font-semibold">Archive &ldquo;{propertyName}&rdquo;?</h2>

                    {openCount > 0 || completedCount > 0 ? (
                        <div className="flex flex-col gap-2 text-sm text-secondary">
                            {openCount > 0 && (
                                <p>
                                    This property has{" "}
                                    <strong className="text-foreground">
                                        {plural(openCount, "open work order", "open work orders")}
                                    </strong>
                                    . {openCount === 1 ? "It" : "They"}&apos;ll be marked{" "}
                                    <strong className="text-foreground">Cancelled</strong> and archived along with the
                                    property. Contractors who were sent a link will be emailed that it&apos;s cancelled.
                                </p>
                            )}
                            {completedCount > 0 && (
                                <p>
                                    <strong className="text-foreground">
                                        {plural(completedCount, "completed work order", "completed work orders")}
                                    </strong>{" "}
                                    waiting for review will be closed and archived.
                                </p>
                            )}
                            <p className="text-subtle">Is this ok?</p>
                        </div>
                    ) : (
                        <p className="text-sm text-secondary">
                            It will be hidden from lists and new work orders. You can restore it later.
                        </p>
                    )}

                    {error && <p className="mt-3 text-sm text-danger">{error}</p>}

                    <div className="mt-5 flex flex-wrap justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => dialogRef.current?.close()}
                            disabled={pending}
                            className={outlineButton}
                        >
                            Go back
                        </button>
                        <button
                            type="button"
                            onClick={handleArchive}
                            disabled={pending}
                            className="shrink-0 rounded-md bg-danger-strong px-4 py-2 text-sm font-medium text-white hover:bg-danger-strong/85 hover:cursor-pointer disabled:opacity-40"
                        >
                            {pending ? "Archiving..." : "Yes, archive"}
                        </button>
                    </div>
                </div>
            </dialog>
        </>
    );
}

export function RestorePropertyButton({ propertyId }: { propertyId: string }) {
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleRestore() {
        setPending(true);
        setError(null);
        try {
            await restoreProperty(propertyId);
        } catch {
            setError("Could not restore. Try again.");
        } finally {
            setPending(false);
        }
    }

    return (
        <>
            <button type="button" onClick={handleRestore} disabled={pending} className={outlineButton}>
                {pending ? "Restoring..." : "Restore"}
            </button>
            {error && <span className="text-sm text-danger">{error}</span>}
        </>
    );
}
