"use client";

import { useId, useOptimistic, useRef, useState, useTransition } from "react";
import { setColorSections, setSplitView } from "./listActions";
import { buttonClass } from "@/lib/ui";
import { SettingsIcon } from "@/components/Icons";

// The gear next to the filters, and its dialog. Settings save as soon as they change; the switch moves
// right away and moves back if saving fails.
export default function ListSettings({ splitView, colorSections }: { splitView: boolean; colorSections: boolean }) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const [shownSplitView, setShownSplitView] = useOptimistic(splitView);
    const [shownColorSections, setShownColorSections] = useOptimistic(colorSections);
    const [, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const titleId = useId();

    function toggle(next: boolean, show: (value: boolean) => void, save: (value: boolean) => Promise<void>) {
        setError(null);
        startTransition(async () => {
            show(next);
            try {
                await save(next);
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
                onClick={(e) => {
                    if (e.target === dialogRef.current) dialogRef.current.close();
                }}
                aria-labelledby={titleId}
                className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-xl border border-line bg-surface p-0 text-foreground shadow-xl backdrop:bg-black/60"
            >
                <div className="p-5">
                    <h2 id={titleId} className="mb-4 text-lg font-semibold">
                        List settings
                    </h2>

                    <div className="flex flex-col gap-4">
                        <Switch
                            label="Split view by status"
                            description="A separate list for each status."
                            checked={shownSplitView}
                            onChange={() => toggle(!shownSplitView, setShownSplitView, setSplitView)}
                        />
                        <Switch
                            label="Color sections"
                            description="Tint each status section with its color. Split view only."
                            checked={shownColorSections}
                            disabled={!shownSplitView}
                            onChange={() => toggle(!shownColorSections, setShownColorSections, setColorSections)}
                        />
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

function Switch({
    label,
    description,
    checked,
    disabled = false,
    onChange,
}: {
    label: string;
    description: string;
    checked: boolean;
    disabled?: boolean;
    onChange: () => void;
}) {
    const labelId = useId();

    return (
        <div className={`flex items-center justify-between gap-4 ${disabled ? "opacity-50" : ""}`}>
            <div>
                <p id={labelId} className="text-sm font-medium">
                    {label}
                </p>
                <p className="text-sm text-subtle">{description}</p>
            </div>
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                aria-labelledby={labelId}
                disabled={disabled}
                onClick={onChange}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors hover:cursor-pointer disabled:cursor-not-allowed ${
                    checked ? "bg-accent" : "bg-line-strong"
                }`}
            >
                <span
                    aria-hidden
                    className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                        checked ? "translate-x-5" : ""
                    }`}
                />
            </button>
        </div>
    );
}
