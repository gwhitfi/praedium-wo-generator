"use client";

import Link from "next/link";
import { useEffect, useId, useRef } from "react";
import { Button } from "@/components/Button";
import { AlertIcon, ChevronDownIcon } from "@/components/Icons";
import { labelClass } from "@/lib/defaults";
import { buttonClass } from "@/lib/ui";

export type ControlProps = {
    id: string;
    "aria-describedby"?: string;
    "aria-invalid"?: true;
    "aria-required"?: true;
};

// One form field: its label (with "(optional)" on optional fields; required ones have no mark and are told to
// screen readers through aria-required), the control, a hint and the error. The control is passed as a function so
// it gets the ids that tie the label, hint and error to it.
export function Field({
    label,
    required = false,
    optional = false,
    hint,
    error,
    className = "",
    children,
}: {
    label: React.ReactNode;
    required?: boolean;
    optional?: boolean;
    hint?: React.ReactNode;
    error?: string[] | string;
    className?: string;
    children: (props: ControlProps) => React.ReactNode;
}): React.ReactElement {
    const id = useId();
    const hintId = `${id}-hint`;
    const errorId = `${id}-error`;
    const message = Array.isArray(error) ? error[0] : error;
    const describedBy = [hint ? hintId : null, message ? errorId : null].filter(Boolean).join(" ") || undefined;

    return (
        <div className={className}>
            <label htmlFor={id} className={labelClass}>
                {label}
                {optional && <span className="ml-1 font-normal text-subtle">(optional)</span>}
            </label>
            {children({
                id,
                "aria-describedby": describedBy,
                "aria-invalid": message ? true : undefined,
                "aria-required": required ? true : undefined,
            })}
            {hint && (
                <p id={hintId} className="mt-1 text-[0.8125rem] leading-5 text-muted">
                    {hint}
                </p>
            )}
            {message && (
                <p id={errorId} className="mt-1 flex items-center gap-1.5 text-sm text-danger">
                    <AlertIcon size={14} className="shrink-0" />
                    {message}
                </p>
            )}
        </div>
    );
}

// A titled group of fields inside a form card. `collapsible` groups (optional details) fold away behind their title
// and start open only when `defaultOpen`, e.g. when they already hold something or have an error.
export function FieldGroup({
    title,
    description,
    collapsible = false,
    defaultOpen = true,
    children,
}: {
    title: string;
    description?: React.ReactNode;
    collapsible?: boolean;
    defaultOpen?: boolean;
    children: React.ReactNode;
}): React.ReactElement {
    if (collapsible) {
        return (
            <div className="border-t border-line pt-6 first:border-t-0 first:pt-0">
                <details open={defaultOpen} className="group/fields">
                    <summary className="flex w-fit cursor-pointer list-none items-center gap-2 rounded text-base font-semibold text-foreground [&::-webkit-details-marker]:hidden">
                        <ChevronDownIcon
                            size={16}
                            className="-rotate-90 text-subtle transition-transform group-open/fields:rotate-0"
                        />
                        {title}
                        <span className="text-sm font-normal text-subtle">(optional)</span>
                    </summary>
                    <fieldset className="min-w-0">
                        <legend className="sr-only">{title}</legend>
                        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
                        <div className="mt-4 flex flex-col gap-4">{children}</div>
                    </fieldset>
                </details>
            </div>
        );
    }

    return (
        <div className="border-t border-line pt-6 first:border-t-0 first:pt-0">
            <fieldset className="min-w-0">
                <legend className="text-base font-semibold text-foreground">{title}</legend>
                {description && <p className="mt-1 text-sm text-muted">{description}</p>}
                <div className="mt-4 flex flex-col gap-4">{children}</div>
            </fieldset>
        </div>
    );
}

// "Fix these to continue", listing the fields with errors as links that jump to them. Takes focus when it appears,
// so keyboard and screen-reader users land on it after a failed save.
export function ErrorSummary({
    errors,
    labels,
    message,
}: {
    errors?: Partial<Record<string, string[]>>;
    labels: Record<string, string>;
    message?: string;
}): React.ReactElement | null {
    const ref = useRef<HTMLDivElement>(null);
    const entries = Object.entries(errors ?? {}).filter(([, list]) => list && list.length > 0);
    const visible = entries.length > 0 || !!message;
    const key = `${message ?? ""}|${entries.map(([name, list]) => `${name}:${list?.[0]}`).join(",")}`;

    useEffect(() => {
        if (visible) ref.current?.focus();
    }, [visible, key]);

    if (!visible) return null;

    return (
        <div
            ref={ref}
            tabIndex={-1}
            role="alert"
            className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-foreground focus:outline-none"
        >
            <p className="flex items-center gap-2 font-medium text-danger">
                <AlertIcon size={16} />
                {message ?? (entries.length === 1 ? "Fix this to continue:" : "Fix these to continue:")}
            </p>
            {entries.length > 0 && (
                <ul className="mt-1.5 list-disc space-y-0.5 pl-9">
                    {entries.map(([name, list]) => (
                        <li key={name}>
                            <a
                                href={`#field-${name}`}
                                onClick={(event) => {
                                    // Jump to the form control with this name and put the cursor in it. A searchable
                                    // dropdown keeps its value in a hidden input; its button sits beside it.
                                    let control = document.querySelector<HTMLElement>(`[name="${name}"]`);
                                    if (control instanceof HTMLInputElement && control.type === "hidden") {
                                        control = control.parentElement?.querySelector<HTMLElement>(
                                            "button[role=combobox]",
                                        ) ?? null;
                                    }
                                    if (!control) return;
                                    event.preventDefault();
                                    control.scrollIntoView({ block: "center" });
                                    control.focus({ preventScroll: true });
                                }}
                                className="underline underline-offset-2 hover:text-danger"
                            >
                                <span className="font-medium">{labels[name] ?? name}:</span> {list?.[0]}
                            </a>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

// The buttons at the bottom of a form: Cancel and the main submit, right-aligned (stacked full width on phones).
// They're in the same order on screen as in the tab order. The submit shows `pendingLabel` and a spinner while
// saving.
export function FormActions({
    cancelHref,
    submitLabel,
    pendingLabel = "Saving…",
    pending,
    note,
}: {
    cancelHref: string;
    submitLabel: string;
    pendingLabel?: string;
    pending: boolean;
    note?: React.ReactNode;
}): React.ReactElement {
    return (
        // The main button first (top on phones, left on wide screens) and Cancel as a quiet button after it, in
        // that order in the code too, so the tab order matches what's seen.
        <div className="flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
            {note && <p className="text-[0.8125rem] text-muted">{note}</p>}
            <div className="flex flex-col gap-2 sm:ml-auto sm:flex-row">
                <Button type="submit" variant="primary" pending={pending} pendingLabel={pendingLabel} className="w-full sm:w-auto">
                    {submitLabel}
                </Button>
                <Link href={cancelHref} className={buttonClass({ variant: "ghost", className: "w-full sm:w-auto" })}>
                    Cancel
                </Link>
            </div>
        </div>
    );
}
