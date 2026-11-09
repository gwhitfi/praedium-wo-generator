"use client";

import { useId, useRef, useState } from "react";
import { archiveContact, restoreContact } from "../actions";
import { Button } from "@/components/Button";
import { useToast } from "@/components/Toaster";

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
}): React.ReactElement {
    const toast = useToast();
    const dialogRef = useRef<HTMLDialogElement>(null);
    const titleId = useId();
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleArchive() {
        setPending(true);
        setError(null);
        try {
            const res = await archiveContact(contactId);
            if (res.ok) {
                dialogRef.current?.close();
                toast(`${contactName} archived.`);
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
            <p className="text-sm text-subtle sm:max-w-56 sm:text-right">
                {openCount} open {openCount === 1 ? "work order" : "work orders"}. Reassign, close or cancel{" "}
                {openCount === 1 ? "it" : "them"} first.
            </p>
        );
    }

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
                        Archive &ldquo;{contactName}&rdquo;?
                    </h2>
                    <p className="text-sm text-secondary">
                        {isTenant
                            ? "They'll be hidden from contacts and won't be added to new work orders for their unit."
                            : "They'll be hidden from contacts and can't be picked for new work orders."}{" "}
                        Past work orders keep their details. You can restore them later.
                    </p>

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
                            Archive contact
                        </Button>
                    </div>
                </div>
            </dialog>
        </>
    );
}

export function RestoreContactButton({ contactId }: { contactId: string }): React.ReactElement {
    const toast = useToast();
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleRestore() {
        setPending(true);
        setError(null);
        try {
            await restoreContact(contactId);
            toast("Contact restored.");
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
