"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "./Button";
import { buttonClass } from "@/lib/ui";
import { inputClass } from "@/lib/defaults";

type Result = { ok: true } | { ok: false; error: string } | void;

// "Delete permanently" and its confirmation dialog: the consequences, an "Archive instead" way out, and a typed
// "yes" before the red button works. The server action gets the typed text too and refuses anything but "yes".
// `requireTyping={false}` is for things with no history to lose (an empty unit): the dialog alone is the check.
// `open` lets a menu item open the dialog instead of the built-in trigger (`hideTrigger`).
export default function DeleteButton({
    itemName,
    label = "Delete permanently",
    onDelete,
    archiveInstead,
    triggerClassName = buttonClass({ variant: "danger-outline", size: "sm" }),
    requireTyping = true,
    openRef,
    hideTrigger = false,
    children,
}: {
    itemName: string;
    label?: React.ReactNode;
    onDelete: (confirmation: string) => Promise<Result>;
    archiveInstead?: () => void;
    triggerClassName?: string;
    requireTyping?: boolean;
    openRef?: React.RefObject<(() => void) | null>;
    hideTrigger?: boolean;
    children?: React.ReactNode;
}): React.ReactElement {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const titleId = useId();
    const descriptionId = useId();
    const [typed, setTyped] = useState("");
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const confirmed = !requireTyping || typed.trim().toLowerCase() === "yes";

    function open() {
        setTyped("");
        setError(null);
        dialogRef.current?.showModal();
    }
    useEffect(() => {
        if (openRef) openRef.current = open;
    });

    async function handleDelete() {
        setPending(true);
        setError(null);
        try {
            // The server still checks for "yes"; without typing, the confirming click supplies it.
            const res = await onDelete(requireTyping ? typed : "yes");
            if (res && !res.ok) {
                setError(res.error);
            } else {
                dialogRef.current?.close();
            }
        } catch {
            setError("Could not delete. Try again.");
        } finally {
            setPending(false);
        }
    }

    return (
        <>
            {!hideTrigger && (
                <button type="button" onClick={open} className={triggerClassName} aria-label={`Delete ${itemName}`}>
                    {label}
                </button>
            )}

            <dialog
                ref={dialogRef}
                aria-labelledby={titleId}
                aria-describedby={descriptionId}
                onClick={(e) => {
                    if (e.target === dialogRef.current && !pending) dialogRef.current.close();
                }}
                className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-danger/40 bg-surface p-0 text-foreground shadow-xl backdrop:bg-black/60"
            >
                <div className="p-5 sm:p-6">
                    <h2 id={titleId} className="text-lg font-semibold">
                        Delete &ldquo;{itemName}&rdquo; permanently?
                    </h2>
                    <p id={descriptionId} className="mt-1 mb-4 text-sm font-medium text-danger">
                        This can&apos;t be undone.
                    </p>

                    {children && <div className="flex flex-col gap-2 text-sm text-secondary">{children}</div>}

                    {archiveInstead && (
                        <p className="mt-3 text-sm text-muted">
                            Want to keep the history?{" "}
                            <button
                                type="button"
                                onClick={() => {
                                    dialogRef.current?.close();
                                    archiveInstead();
                                }}
                                className="font-medium text-foreground underline underline-offset-4 hover:cursor-pointer"
                            >
                                Archive instead
                            </button>
                        </p>
                    )}

                    {requireTyping && (
                        <label className="mt-5 block text-sm font-medium text-secondary">
                            Type <strong className="text-foreground">yes</strong> to confirm
                            <input
                                value={typed}
                                onChange={(e) => setTyped(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && confirmed && !pending) handleDelete();
                                }}
                                autoComplete="off"
                                className={`${inputClass} mt-1 focus:border-danger focus:ring-danger/40`}
                            />
                        </label>
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
                        <Button
                            variant="danger"
                            onClick={handleDelete}
                            disabled={!confirmed}
                            pending={pending}
                            pendingLabel="Deleting…"
                        >
                            Delete forever
                        </Button>
                    </div>
                </div>
            </dialog>
        </>
    );
}
