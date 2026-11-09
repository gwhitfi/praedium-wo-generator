"use client";

import { useEffect, useId, useState } from "react";
import { clearTextDraft, readTextDraft, saveTextDraft } from "@/lib/formDraft";
import { toggleLineItem, saveLineItemNote } from "./actions";
import { inputClass } from "@/lib/defaults";
import { cardClass } from "@/lib/ui";
import { Button } from "@/components/Button";
import { PriorityBadge } from "@/components/StatusBadge";
import { CheckIcon, NoteIcon, PencilIcon } from "@/components/Icons";

type LineItemRow = {
    id: string;
    description: string;
    priority: string;
    completed: boolean;
    contractorNotes: string | null;
    // The line item's photos, oldest first (at most MAX_LINE_ITEM_PHOTOS).
    attachments: { id: string }[];
};

type AreaRow = {
    id: string;
    name: string;
    lineItems: LineItemRow[];
};

// One area on the contractor's page. Each item is one big checkbox (the box and its text), sized for a thumb, with
// its photo and the contractor's note under it.
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
    // An error shows under the item it's about.
    const [error, setError] = useState<{ itemId: string; message: string } | null>(null);
    // A short "Saved" under the item just saved, also read out by screen readers.
    const [savedItemId, setSavedItemId] = useState<string | null>(null);
    const [notingId, setNotingId] = useState<string | null>(null);
    // Unsaved note text per item, so opening another item's note doesn't throw away what was typed.
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const headingId = useId();

    const doneCount = area.lineItems.filter((i) => i.completed).length;
    const allDone = area.lineItems.length > 0 && doneCount === area.lineItems.length;
    const hasUnsavedDraft = (item: LineItemRow) =>
        drafts[item.id] !== undefined && drafts[item.id].trim() !== (item.contractorNotes ?? "");

    // Unsent notes are also kept in this browser, so a reload or a dropped connection doesn't lose them; they come
    // back as "Note not saved yet".
    const draftKey = (itemId: string) => `praedium-note:${token}:${itemId}`;
    const itemIds = area.lineItems.map((item) => item.id).join(",");
    useEffect(() => {
        const restored: Record<string, string> = {};
        for (const id of itemIds.split(",").filter(Boolean)) {
            const saved = readTextDraft(`praedium-note:${token}:${id}`);
            if (saved) restored[id] = saved;
        }
        if (Object.keys(restored).length > 0) {
            // eslint-disable-next-line react-hooks/set-state-in-effect -- a one-time restore from browser storage
            setDrafts((current) => ({ ...restored, ...current }));
        }
    }, [token, itemIds]);

    // After a save or cancel, put the keyboard focus back on the item's note button, where the user was.
    function focusLater(id: string) {
        requestAnimationFrame(() => document.getElementById(id)?.focus());
    }

    function showSaved(itemId: string) {
        setSavedItemId(itemId);
        setTimeout(() => setSavedItemId((current) => (current === itemId ? null : current)), 2500);
    }

    async function handleToggle(item: LineItemRow) {
        setBusyItemId(item.id);
        try {
            await actions.toggleLineItem(token, item.id);
            setError(null);
            showSaved(item.id);
        } catch {
            setError({ itemId: item.id, message: "Couldn't update this item. Check your connection and try again." });
        } finally {
            setBusyItemId(null);
        }
    }

    function startNote(item: LineItemRow) {
        setNotingId(item.id);
        setDrafts((current) =>
            current[item.id] !== undefined ? current : { ...current, [item.id]: item.contractorNotes ?? "" },
        );
    }

    function closeNote(item: LineItemRow, discard: boolean) {
        setNotingId(null);
        if (discard) {
            clearTextDraft(draftKey(item.id));
            setDrafts((current) => {
                const rest = { ...current };
                delete rest[item.id];
                return rest;
            });
        }
        focusLater(`note-button-${item.id}`);
    }

    async function handleSaveNote(item: LineItemRow) {
        const draft = drafts[item.id] ?? "";
        if (draft.trim() === (item.contractorNotes ?? "")) {
            closeNote(item, true);
            return;
        }

        setBusyItemId(item.id);
        try {
            await actions.saveLineItemNote(token, item.id, draft);
            setError(null);
            closeNote(item, true);
            showSaved(item.id);
        } catch {
            setError({ itemId: item.id, message: "Couldn't save this note. It's still here; try again." });
        } finally {
            setBusyItemId(null);
        }
    }

    return (
        <li aria-labelledby={headingId} className={`${cardClass} overflow-hidden`}>
            <div className="flex items-center justify-between gap-3 border-b border-line bg-surface-hover/40 px-4 py-3">
                <h3 id={headingId} className="font-semibold text-foreground">
                    {area.name}
                </h3>
                {area.lineItems.length > 0 && (
                    <span
                        className={`inline-flex shrink-0 items-center gap-1 text-sm ${allDone ? "font-medium text-success" : "text-subtle"}`}
                    >
                        {allDone && <CheckIcon size={14} />}
                        {doneCount} of {area.lineItems.length} done
                    </span>
                )}
            </div>

            {area.lineItems.length === 0 ? (
                <p className="px-4 py-3 text-sm text-subtle">No items in this area.</p>
            ) : (
                <ul className="divide-y divide-line">
                    {area.lineItems.map((item) => {
                        const busy = busyItemId === item.id;
                        const noteId = `note-${item.id}`;

                        return (
                            <li key={item.id} className="px-2 py-1.5">
                                <button
                                    type="button"
                                    data-demo-guide="check-item"
                                    role="checkbox"
                                    aria-checked={item.completed}
                                    onClick={() => handleToggle(item)}
                                    disabled={readOnly || busy}
                                    className={`flex min-h-12 w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left transition-colors enabled:hover:cursor-pointer enabled:hover:bg-surface-hover/60 disabled:cursor-default ${busy ? "opacity-60" : ""}`}
                                >
                                    <span
                                        aria-hidden
                                        className={`mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
                                            item.completed
                                                ? "border-success bg-success text-background"
                                                : readOnly
                                                  ? // Locked until verified (or closed): dashed, so it doesn't look tappable.
                                                    "border-dashed border-line-strong bg-transparent"
                                                  : "border-line-strong bg-surface"
                                        }`}
                                    >
                                        {item.completed && <CheckIcon size={15} strokeWidth={3} />}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span
                                            className={`block text-base leading-6 [overflow-wrap:anywhere] ${
                                                item.completed
                                                    ? "text-muted"
                                                    : "text-foreground"
                                            }`}
                                        >
                                            {item.description}
                                        </span>
                                        {item.priority !== "MEDIUM" && item.priority !== "LOW" && (
                                            <span className="mt-1.5 block">
                                                <PriorityBadge priority={item.priority} />
                                            </span>
                                        )}
                                    </span>
                                </button>

                                <div className="ml-11 flex flex-col gap-2 pr-2 pb-1 empty:hidden">
                                    {!summaryOnly && item.attachments.length > 0 && (
                                        <ul
                                            className="flex flex-wrap gap-2"
                                            aria-label={`Photos for ${item.description}`}
                                        >
                                            {item.attachments.map((photo, i) => (
                                                <li key={photo.id}>
                                                    <a
                                                        href={`/wo/${token}/photos/${photo.id}`}
                                                        target="_blank"
                                                        rel="noopener"
                                                        className="block"
                                                        aria-label={`Open ${item.attachments.length === 1 ? "the photo" : `photo ${i + 1}`} for ${item.description} (new tab)`}
                                                    >
                                                        {/* next/image's optimizer would cache the photo outside our access check. */}
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img
                                                            src={`/wo/${token}/photos/${photo.id}`}
                                                            alt={`Photo ${i + 1} for ${item.description}`}
                                                            loading="lazy"
                                                            className="h-24 w-24 rounded-md border border-line-strong object-cover hover:border-line-hover"
                                                        />
                                                    </a>
                                                </li>
                                            ))}
                                        </ul>
                                    )}

                                    {notingId === item.id ? (
                                        <div className="flex flex-col gap-2">
                                            <label htmlFor={noteId} className="text-sm font-medium text-secondary">
                                                Note for the office
                                            </label>
                                            <textarea
                                                id={noteId}
                                                data-demo-guide="note-input"
                                                value={drafts[item.id] ?? ""}
                                                onChange={(e) => {
                                                    setDrafts((current) => ({ ...current, [item.id]: e.target.value }));
                                                    saveTextDraft(draftKey(item.id), e.target.value);
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.nativeEvent.isComposing) return;
                                                    // Escape closes the box but keeps the text for later.
                                                    if (e.key === "Escape") closeNote(item, false);
                                                    // Enter starts a new line, as in any text box. Ctrl+Enter (⌘+Enter
                                                    // on a Mac) saves, as a shortcut for the Save button.
                                                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
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
                                                <Button
                                                    variant="primary"
                                                    size="sm"
                                                    onClick={() => handleSaveNote(item)}
                                                    pending={busy}
                                                    pendingLabel="Saving…"
                                                >
                                                    Save note
                                                </Button>
                                                <Button variant="ghost" size="sm" onClick={() => closeNote(item, true)}>
                                                    Cancel
                                                </Button>
                                            </div>
                                        </div>
                                    ) : !summaryOnly && !readOnly && hasUnsavedDraft(item) ? (
                                        // Typed but not saved (another note was opened, or Escape was pressed).
                                        <button
                                            id={`note-button-${item.id}`}
                                            type="button"
                                            onClick={() => startNote(item)}
                                            className="-ml-1 inline-flex min-h-10 items-center gap-1.5 self-start rounded px-1 text-sm font-medium text-warning hover:cursor-pointer hover:underline"
                                        >
                                            <NoteIcon size={14} />
                                            Note not saved yet: finish it
                                            <span className="sr-only"> for {item.description}</span>
                                        </button>
                                    ) : (
                                        !summaryOnly &&
                                        (item.contractorNotes ? (
                                            readOnly ? (
                                                <p className="whitespace-pre-line rounded-md border-l-2 border-accent/50 bg-surface-hover/50 px-3 py-2 text-sm text-secondary">
                                                    {item.contractorNotes}
                                                </p>
                                            ) : (
                                                <button
                                                    id={`note-button-${item.id}`}
                                                    type="button"
                                                    onClick={() => startNote(item)}
                                                    className="group flex w-full items-start gap-2 rounded-md border-l-2 border-accent/50 bg-surface-hover/50 px-3 py-2 text-left text-sm text-secondary hover:cursor-pointer hover:bg-surface-hover"
                                                >
                                                    <span className="min-w-0 flex-1 whitespace-pre-line">
                                                        {item.contractorNotes}
                                                    </span>
                                                    <span className="mt-0.5 shrink-0 text-subtle group-hover:text-foreground">
                                                        <PencilIcon size={13} />
                                                    </span>
                                                    <span className="sr-only">(edit note)</span>
                                                </button>
                                            )
                                        ) : (
                                            !readOnly && (
                                                <button
                                                    id={`note-button-${item.id}`}
                                                    type="button"
                                                    data-demo-guide="add-note"
                                                    onClick={() => startNote(item)}
                                                    className="-ml-1 inline-flex min-h-10 items-center gap-1.5 self-start rounded px-1 text-sm text-muted hover:cursor-pointer hover:text-foreground"
                                                >
                                                    <NoteIcon size={14} />
                                                    Add a note
                                                    <span className="sr-only"> to {item.description}</span>
                                                </button>
                                            )
                                        ))
                                    )}
                                    {/* This item's own feedback: saving, saved, or what went wrong. */}
                                    {busy && <p className="text-[0.8125rem] text-muted">Saving…</p>}
                                    {!busy && savedItemId === item.id && (
                                        <p className="inline-flex items-center gap-1 text-[0.8125rem] text-success">
                                            <CheckIcon size={12} />
                                            Saved
                                        </p>
                                    )}
                                    {error?.itemId === item.id && (
                                        <p role="alert" className="text-sm text-danger">
                                            {error.message}
                                        </p>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}

            {/* Read out when an item finishes saving; the visible "Saved" is under the item. */}
            <p role="status" className="sr-only">
                {savedItemId ? "Saved." : ""}
            </p>
        </li>
    );
}
