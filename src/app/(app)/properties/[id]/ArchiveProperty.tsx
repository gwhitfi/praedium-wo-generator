"use client";

import { useId, useRef, useState } from "react";
import { archiveProperty, restoreProperty } from "../actions";
import { Button } from "@/components/Button";
import { useToast } from "@/components/Toaster";

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
}): React.ReactElement {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const titleId = useId();
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
            <Button size="sm" onClick={() => dialogRef.current?.showModal()}>
                Archive
            </Button>

            <dialog
                ref={dialogRef}
                aria-labelledby={titleId}
                onClick={(e) => {
                    // Clicking the backdrop (the dialog element itself) closes it.
                    if (e.target === dialogRef.current && !pending) dialogRef.current.close();
                }}
                className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-line bg-surface p-0 text-foreground shadow-xl backdrop:bg-black/60"
            >
                <div className="p-5 sm:p-6">
                    <h2 id={titleId} className="mb-2 text-lg font-semibold">
                        Archive &ldquo;{propertyName}&rdquo;?
                    </h2>

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
                        </div>
                    ) : (
                        <p className="text-sm text-secondary">
                            It will be hidden from lists and new work orders. You can restore it later.
                        </p>
                    )}

                    {error && (
                        <p role="alert" className="mt-3 text-sm text-danger">
                            {error}
                        </p>
                    )}

                    <div className="mt-6 flex flex-wrap justify-end gap-2">
                        <Button onClick={() => dialogRef.current?.close()} disabled={pending}>
                            Go back
                        </Button>
                        <Button variant="danger" onClick={handleArchive} pending={pending} pendingLabel="Archiving…">
                            Archive property
                        </Button>
                    </div>
                </div>
            </dialog>
        </>
    );
}

export function RestorePropertyButton({ propertyId }: { propertyId: string }): React.ReactElement {
    const toast = useToast();
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleRestore() {
        setPending(true);
        setError(null);
        try {
            await restoreProperty(propertyId);
            toast("Property restored.");
        } catch {
            setError("Could not restore. Try again.");
        } finally {
            setPending(false);
        }
    }

    return (
        <span className="flex flex-col items-end gap-1">
            <Button size="sm" onClick={handleRestore} pending={pending} pendingLabel="Restoring…">
                Restore
            </Button>
            {error && (
                <span role="alert" className="text-sm text-danger">
                    {error}
                </span>
            )}
        </span>
    );
}
