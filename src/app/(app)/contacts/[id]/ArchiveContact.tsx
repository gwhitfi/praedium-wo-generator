"use client";

import { useRef, useState } from "react";
import { archiveContact, restoreContact } from "../actions";

const outlineButton =
    "shrink-0 rounded-md border border-line-strong px-4 py-2 text-sm text-foreground hover:bg-surface-hover hover:cursor-pointer disabled:opacity-40 disabled:hover:cursor-not-allowed";

export function ArchiveContactButton({
    contactId,
    contactName,
    openCount,
    isTenant,
}: {
    contactId: string;
    contactName: string;
    openCount: number;
    isTenant: boolean;
}) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleArchive() {
        setPending(true);
        setError(null);
        try {
            const res = await archiveContact(contactId);
            if (res.ok) {
                dialogRef.current?.close();
            } else {
                setError(res.error);
            }
        } catch {
            setError("Could not archive the contact. Try again.");
        } finally {
            setPending(false);
        }
    }

    if (openCount > 0) {
        return (
            <p className="text-sm text-subtle">
                Can&apos;t archive or delete: {openCount} open {openCount === 1 ? "work order" : "work orders"}.
                Reassign, close or cancel {openCount === 1 ? "it" : "them"} first.
            </p>
        );
    }

    return (
        <>
            <button
                type="button"
                onClick={() => dialogRef.current?.showModal()}
                className="shrink-0 rounded-md px-4 py-2 text-sm text-subtle hover:text-danger hover:cursor-pointer"
            >
                Archive contact
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
                    <h2 className="mb-2 text-lg font-semibold">Archive &ldquo;{contactName}&rdquo;?</h2>
                    <p className="text-sm text-secondary">
                        {isTenant
                            ? "They'll be hidden from contacts and won't be added to new work orders for their unit."
                            : "They'll be hidden from contacts and can't be picked for new work orders."}{" "}
                        Past work orders keep their details. You can restore them later.
                    </p>

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

export function RestoreContactButton({ contactId }: { contactId: string }) {
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleRestore() {
        setPending(true);
        setError(null);
        try {
            await restoreContact(contactId);
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
