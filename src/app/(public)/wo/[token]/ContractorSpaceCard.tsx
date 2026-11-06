"use client";

import { useState } from "react";
import { toggleLineItem, saveLineItemNote } from "./actions";
import { inputClass, PRIORITY_STYLES, PRIORITY_LABELS } from "@/lib/defaults";

type LineItemRow = {
    id: string;
    description: string;
    priority: string;
    completed: boolean;
    contractorNotes: string | null;
    // At most one: the line item's photo.
    attachments: { id: string }[];
};

type AreaRow = {
    id: string;
    name: string;
    lineItems: LineItemRow[];
};

export default function ContractorSpaceCard({
    token,
    area,
    readOnly,
    summaryOnly = false,
    actions = { toggleLineItem, saveLineItemNote },
}: {
    token: string;
    area: AreaRow;
    readOnly: boolean;
    // Before the contractor verifies (and on closed work orders): no photos and no contractor notes, only the items.
    summaryOnly?: boolean;
    actions?: {
        toggleLineItem: (token: string, id: string) => Promise<unknown>;
        saveLineItemNote: (token: string, id: string, note: string) => Promise<unknown>;
    };
}): React.ReactElement {
    const [busyItemId, setBusyItemId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [notingId, setNotingId] = useState<string | null>(null);
    const [noteDraft, setNoteDraft] = useState("");

    const doneCount = area.lineItems.filter((i) => i.completed).length;

    async function handleToggle(item: LineItemRow) {
        setBusyItemId(item.id);
        try {
            await actions.toggleLineItem(token, item.id);
            setError(null);
        } catch {
            setError("Could not update that item. Try again.");
        } finally {
            setBusyItemId(null);
        }
    }

    function startNote(item: LineItemRow) {
        setNotingId(item.id);
        setNoteDraft(item.contractorNotes ?? "");
    }

    async function handleSaveNote(item: LineItemRow) {
        if (noteDraft.trim() === (item.contractorNotes ?? "")) {
            setNotingId(null);
            return;
        }

        setBusyItemId(item.id);
        try {
            await actions.saveLineItemNote(token, item.id, noteDraft);
            setNotingId(null);
            setError(null);
        } catch {
            setError("Could not save that note. Try again.");
        } finally {
            setBusyItemId(null);
        }
    }

    return (
        <li className="rounded-md border border-line bg-surface px-4 py-3">
            <div className="flex items-center justify-between">
                <h3>{area.name}</h3>
                {area.lineItems.length > 0 && (
                    <span className="text-xs text-subtle">
                        {doneCount}/{area.lineItems.length} done
                    </span>
                )}
            </div>

            {area.lineItems.length === 0 ? (
                <p className="mt-2 text-sm text-subtle">No items.</p>
            ) : (
                <ul className="mt-2 flex flex-col gap-1 text-base text-secondary">
                    {area.lineItems.map((item) => {
                        const busy = busyItemId === item.id;

                        return (
                            <li key={item.id} className="py-1">
                                <div className="flex items-start gap-3">
                                    <button
                                        type="button"
                                        data-demo-guide="check-item"
                                        role="checkbox"
                                        aria-checked={item.completed}
                                        aria-label={`Mark "${item.description}" ${item.completed ? "not done" : "done"}`}
                                        onClick={() => handleToggle(item)}
                                        disabled={readOnly || busy}
                                        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded border text-sm hover:cursor-pointer disabled:cursor-default disabled:opacity-60 ${
                                            item.completed
                                                ? "border-success/50 bg-success/15 text-success"
                                                : "border-faint hover:border-muted"
                                        }`}
                                    >
                                        {item.completed && "✓"}
                                    </button>

                                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                                        <span
                                            className={item.completed ? "text-subtle line-through" : "text-foreground"}
                                        >
                                            {item.description}
                                        </span>
                                        {PRIORITY_STYLES[item.priority] && (
                                            <span
                                                className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${PRIORITY_STYLES[item.priority]}`}
                                            >
                                                {PRIORITY_LABELS[item.priority]}
                                            </span>
                                        )}
                                    </div>

                                    {!readOnly && notingId !== item.id && !item.contractorNotes && (
                                        <button
                                            type="button"
                                            data-demo-guide="add-note"
                                            onClick={() => startNote(item)}
                                            className="shrink-0 text-sm text-subtle hover:text-foreground hover:cursor-pointer"
                                        >
                                            + Note
                                        </button>
                                    )}
                                </div>

                                {!summaryOnly && item.attachments[0] && (
                                    <a
                                        href={`/wo/${token}/photos/${item.attachments[0].id}`}
                                        target="_blank"
                                        rel="noopener"
                                        className="ml-9 mt-2 inline-block"
                                        aria-label={`Open the photo for ${item.description}`}
                                    >
                                        {/* next/image's optimizer would cache the photo outside our access check. */}
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={`/wo/${token}/photos/${item.attachments[0].id}`}
                                            alt={`Photo for ${item.description}`}
                                            loading="lazy"
                                            className="h-24 w-24 rounded border border-line-strong object-cover hover:border-muted"
                                        />
                                    </a>
                                )}

                                {notingId === item.id ? (
                                    <div className="ml-9 mt-2 flex flex-col gap-2">
                                        <textarea
                                            data-demo-guide="note-input"
                                            value={noteDraft}
                                            onChange={(e) => setNoteDraft(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.nativeEvent.isComposing) return;
                                                if (e.key === "Escape") setNotingId(null);
                                                if (e.key === "Enter" && !e.shiftKey) {
                                                    e.preventDefault();
                                                    if (!busy && !e.repeat) void handleSaveNote(item);
                                                }
                                            }}
                                            rows={3}
                                            maxLength={2000}
                                            placeholder="What was done, parts used, anything the office should know"
                                            autoFocus
                                            className={inputClass}
                                        />
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => handleSaveNote(item)}
                                                disabled={busy}
                                                className="shrink-0 rounded-md border border-line-strong px-4 py-2 text-sm text-foreground hover:bg-surface-hover hover:cursor-pointer disabled:opacity-40"
                                            >
                                                {busy ? "Saving..." : "Save note"}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setNotingId(null)}
                                                className="shrink-0 px-2 text-sm text-subtle hover:text-foreground hover:cursor-pointer"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    !summaryOnly &&
                                    item.contractorNotes && (
                                        <p
                                            onClick={readOnly ? undefined : () => startNote(item)}
                                            className={`ml-9 mt-1 whitespace-pre-line rounded px-1 text-sm text-muted ${
                                                readOnly ? "" : "cursor-text hover:bg-surface-hover"
                                            }`}
                                        >
                                            {item.contractorNotes}
                                        </p>
                                    )
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}

            {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        </li>
    );
}
