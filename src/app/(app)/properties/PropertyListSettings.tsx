"use client";

import { useId, useOptimistic, useRef, useState, useTransition } from "react";
import { setGroupByType } from "./actions";
import { buttonClass } from "@/lib/ui";
import { SettingsIcon } from "@/components/Icons";

// The settings button beside the Properties toolbar, and its dialog: "Group by type". Saves as soon as it changes;
// the switch moves right away and moves back if saving fails.
export default function PropertyListSettings({ groupByType }: { groupByType: boolean }): React.ReactElement {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const titleId = useId();
    const labelId = useId();
    const [shown, setShown] = useOptimistic(groupByType);
    const [, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    function toggle() {
        setError(null);
        startTransition(async () => {
            setShown(!shown);
            try {
                await setGroupByType(!shown);
            } catch {
                setError("Could not save. Try again.");
            }
        });
    }

    return (
        <>
            <button
                type="button"
                onClick={() => {
                    setError(null);
                    dialogRef.current?.showModal();
                }}
                aria-label="List settings"
                title="List settings"
                className="flex h-10 w-10 items-center justify-center rounded-md border border-line-strong bg-surface text-muted hover:border-line-hover hover:text-foreground hover:cursor-pointer"
            >
                <SettingsIcon size={16} />
            </button>

            <dialog
                ref={dialogRef}
                aria-labelledby={titleId}
                onClick={(e) => {
                    if (e.target === dialogRef.current) dialogRef.current.close();
                }}
                className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-xl border border-line bg-surface p-0 text-foreground shadow-xl backdrop:bg-black/60"
            >
                <div className="p-5">
                    <h2 id={titleId} className="mb-4 text-lg font-semibold">
                        List settings
                    </h2>
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <p id={labelId} className="text-sm font-medium">
                                Group by type
                            </p>
                            <p className="text-sm text-subtle">A separate list for houses, duplexes, apartments…</p>
                        </div>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={shown}
                            aria-labelledby={labelId}
                            onClick={toggle}
                            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors hover:cursor-pointer ${
                                shown ? "bg-accent" : "bg-line-strong"
                            }`}
                        >
                            <span
                                aria-hidden
                                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                                    shown ? "translate-x-5" : ""
                                }`}
                            />
                        </button>
                    </div>
                    {error && (
                        <p role="alert" className="mt-3 text-sm text-danger">
                            {error}
                        </p>
                    )}
                    <div className="mt-5 flex justify-end">
                        <button
                            type="button"
                            onClick={() => dialogRef.current?.close()}
                            className={buttonClass({ variant: "primary" })}
                        >
                            Done
                        </button>
                    </div>
                </div>
            </dialog>
        </>
    );
}
