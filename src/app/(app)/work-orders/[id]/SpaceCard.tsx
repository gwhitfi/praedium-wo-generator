"use client";

import { useRef, useState } from "react";
import { addLineItem, removeLineItem, moveLineItem, updateLineItem } from "../actions";
import { LineItemPriority } from "@/generated/prisma/enums";
import { inputClass, PRIORITY_STYLES, PRIORITY_LABELS } from "@/lib/defaults";
import LineItemPhoto from "./LineItemPhoto";

type LineItemRow = {
    id: string;
    description: string;
    priority: string;
    completed: boolean;
    completedAt: Date | null;
    contractorNotes: string | null;
    // At most one: the line item's photo.
    attachments: { id: string }[];
};

type AreaRow = {
    id: string;
    name: string;
    lineItems: LineItemRow[];
};

export default function SpaceCard({
    area,
    index,
    total,
    onMove,
    onRemove,
    onRename,
    busy,
    readOnly,
    actions = { addLineItem, removeLineItem, moveLineItem, updateLineItem },
    showPhotos = true,
}: {
    area: AreaRow;
    index: number;
    total: number;
    onMove: (id: string, direction: "up" | "down") => void;
    onRemove: (id: string) => void;
    onRename: (id: string, name: string) => Promise<unknown> | void;
    busy: boolean;
    readOnly: boolean;
    actions?: {
        addLineItem: (areaId: string, description: string, priority: LineItemPriority) => Promise<unknown>;
        removeLineItem: (id: string) => Promise<unknown>;
        moveLineItem: (id: string, direction: "up" | "down") => Promise<unknown>;
        updateLineItem: (id: string, description: string, priority: LineItemPriority) => Promise<unknown>;
    };
    showPhotos?: boolean;
}) {
    const [adding, setAdding] = useState(false);
    const [description, setDescription] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);
    const [priority, setPriority] = useState("MEDIUM");
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [busyItemId, setBusyItemId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editDraft, setEditDraft] = useState("");
    const [editPriority, setEditPriority] = useState("MEDIUM");
    const [renaming, setRenaming] = useState(false);
    const [nameDraft, setNameDraft] = useState("");
    // Set when Enter or Escape has already handled the rename, so the blur that follows doesn't save again.
    const skipNameBlur = useRef(false);
    const doneCount = area.lineItems.filter((i) => i.completed).length;

    async function handleRename() {
        const trimmed = nameDraft.trim();
        if (!trimmed || trimmed === area.name) {
            setRenaming(false);
            return;
        }

        try {
            await onRename(area.id, trimmed);
            setRenaming(false);
            setError(null);
        } catch {
            skipNameBlur.current = false;
            setError("Could not rename that area.");
        }
    }

    async function handleAddItem() {
        const trimmed = description.trim();
        if (!trimmed) return;

        setPending(true);
        try {
            await actions.addLineItem(area.id, trimmed, priority as LineItemPriority);
            setDescription("");
            setError(null);
        } catch {
            setError("Could not add that item. Try again.");
        } finally {
            setPending(false);
            inputRef.current?.focus();
        }
    }

    async function handleRemoveItem(lineItemId: string) {
        setBusyItemId(lineItemId);
        try {
            await actions.removeLineItem(lineItemId);
            setError(null);
        } catch {
            setError("Could not remove that item.");
        } finally {
            setBusyItemId(null);
        }
    }

    async function handleMoveItem(lineItemId: string, direction: "up" | "down") {
        setBusyItemId(lineItemId);
        try {
            await actions.moveLineItem(lineItemId, direction);
            setError(null);
        } catch {
            setError("Could not move that item.");
        } finally {
            setBusyItemId(null);
        }
    }

    async function handleSaveEdit(item: LineItemRow) {
        const trimmed = editDraft.trim();

        if (!trimmed || (trimmed === item.description && editPriority === item.priority)) {
            setEditingId(null);
            return;
        }

        setBusyItemId(item.id);
        try {
            await actions.updateLineItem(item.id, trimmed, editPriority as LineItemPriority);
            setEditingId(null);
            setError(null);
        } catch {
            setError("Could not save that change.");
        } finally {
            setBusyItemId(null);
        }
    }
    return (
        <li className="overflow-hidden rounded-md border border-line bg-surface px-4 py-3">
            <div className="-mx-4 -mt-3 flex items-center justify-between gap-3 border-b border-line bg-surface-hover/40 px-4 py-2.5">
                <h3 className={`flex min-w-0 items-baseline gap-2 font-semibold ${renaming ? "flex-1" : ""}`}>
                    {!readOnly && renaming ? (
                        <input
                            value={nameDraft}
                            onChange={(e) => setNameDraft(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    skipNameBlur.current = true;
                                    handleRename();
                                }
                                if (e.key === "Escape") {
                                    skipNameBlur.current = true;
                                    setRenaming(false);
                                }
                            }}
                            onBlur={() => {
                                if (skipNameBlur.current) {
                                    skipNameBlur.current = false;
                                    return;
                                }
                                handleRename();
                            }}
                            maxLength={100}
                            autoFocus
                            aria-label={`New name for ${area.name}`}
                            className="min-w-0 flex-1 rounded border border-faint bg-surface-hover px-2 py-0.5 text-base text-foreground focus:outline-none"
                        />
                    ) : readOnly ? (
                        area.name
                    ) : (
                        <button
                            type="button"
                            onClick={() => {
                                skipNameBlur.current = false;
                                setNameDraft(area.name);
                                setRenaming(true);
                            }}
                            aria-label={`Rename ${area.name}`}
                            className="-mx-1 cursor-text rounded px-1 text-left font-semibold hover:bg-surface-hover"
                        >
                            {area.name}
                        </button>
                    )}
                    {area.lineItems.length > 0 && (
                        <span className="text-xs font-normal text-subtle">
                            {doneCount}/{area.lineItems.length} done
                        </span>
                    )}
                </h3>
                <div className={`flex items-center gap-2 ${readOnly ? "hidden" : ""}`}>
                    <button
                        type="button"
                        onClick={() => onMove(area.id, "up")}
                        disabled={index === 0 || busy}
                        className="text-subtle hover:text-foreground hover:cursor-pointer disabled:opacity-30"
                        aria-label={`Move ${area.name} up`}
                    >
                        ↑
                    </button>
                    <button
                        type="button"
                        onClick={() => onMove(area.id, "down")}
                        disabled={index === total - 1 || busy}
                        className="text-subtle hover:text-foreground hover:cursor-pointer disabled:opacity-30"
                        aria-label={`Move ${area.name} down`}
                    >
                        ↓
                    </button>
                    <button
                        type="button"
                        onClick={() => onRemove(area.id)}
                        disabled={busy}
                        className="text-xs text-subtle hover:text-danger hover:cursor-pointer disabled:opacity-30"
                    >
                        Remove
                    </button>
                </div>
            </div>
            {area.lineItems.length > 0 && (
                <ul className="divide-y divide-line text-base text-secondary">
                    {area.lineItems.map((item, i) => (
                        <li key={item.id} className="group py-2.5">
                            <div className="flex items-center gap-2">
                                <span
                                    aria-label={item.completed ? "Done" : "Not done"}
                                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs ${
                                        item.completed
                                            ? "border-success/50 bg-success/15 text-success"
                                            : "border-line-strong"
                                    }`}
                                >
                                    {item.completed && "✓"}
                                </span>
                                {editingId === item.id ? (
                                    <div
                                        className="flex flex-1 items-center gap-2"
                                        onBlur={(e) => {
                                            if (!e.currentTarget.contains(e.relatedTarget)) handleSaveEdit(item);
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") handleSaveEdit(item);
                                            if (e.key === "Escape") setEditingId(null);
                                        }}
                                    >
                                        <input
                                            value={editDraft}
                                            onChange={(e) => setEditDraft(e.target.value)}
                                            autoFocus
                                            className="min-w-0 flex-1 rounded border border-faint bg-surface-hover px-2 py-0.5 text-base text-foreground focus:outline-none"
                                        />
                                        <select
                                            value={editPriority}
                                            onChange={(e) => setEditPriority(e.target.value)}
                                            aria-label={`Priority for ${item.description}`}
                                            className="shrink-0 rounded border border-faint bg-surface-hover px-2 py-0.5 text-sm text-foreground focus:outline-none"
                                        >
                                            {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                                                <option key={value} value={value}>
                                                    {label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                ) : (
                                    <span
                                        onClick={
                                            readOnly
                                                ? undefined
                                                : () => {
                                                      setEditingId(item.id);
                                                      setEditDraft(item.description);
                                                      setEditPriority(item.priority);
                                                  }
                                        }
                                        className={`rounded px-1 ${readOnly ? "" : "cursor-text hover:bg-surface-hover"} ${
                                            item.completed ? "text-subtle" : ""
                                        }`}
                                    >
                                        {item.description}
                                    </span>
                                )}
                                <div className="ml-auto flex shrink-0 items-center gap-2">
                                    {editingId !== item.id && PRIORITY_STYLES[item.priority] && (
                                        <span
                                            className={`rounded-full border px-2 py-0.5 text-xs cursor-default ${PRIORITY_STYLES[item.priority]}`}
                                        >
                                            {PRIORITY_LABELS[item.priority]}
                                        </span>
                                    )}
                                    {item.completedAt && (
                                        <span suppressHydrationWarning className="text-xs text-success">
                                            Done {new Date(item.completedAt).toLocaleDateString()}
                                        </span>
                                    )}
                                    {!readOnly && (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => handleMoveItem(item.id, "up")}
                                                disabled={i === 0 || busyItemId === item.id}
                                                className="text-xs text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground hover:cursor-pointer disabled:text-line disabled:hover:text-line"
                                                aria-label={`Move ${item.description} up`}
                                            >
                                                ↑
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleMoveItem(item.id, "down")}
                                                disabled={i === area.lineItems.length - 1 || busyItemId === item.id}
                                                className="text-xs text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground hover:cursor-pointer disabled:text-line disabled:hover:text-line"
                                                aria-label={`Move ${item.description} down`}
                                            >
                                                ↓
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => handleRemoveItem(item.id)}
                                                disabled={busyItemId === item.id}
                                                className="text-xs text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger hover:cursor-pointer disabled:text-line disabled:hover:text-line"
                                                aria-label={`Remove ${item.description}`}
                                            >
                                                Remove
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                            {showPhotos && (
                                <LineItemPhoto
                                    lineItemId={item.id}
                                    description={item.description}
                                    photoId={item.attachments[0]?.id ?? null}
                                    readOnly={readOnly}
                                />
                            )}
                            {item.contractorNotes && (
                                <p className="ml-7 mt-1 whitespace-pre-line border-l-2 border-line-strong pl-2 text-sm text-muted">
                                    <span className="text-subtle">Contractor: </span>
                                    {item.contractorNotes}
                                </p>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            {error && <p className="mt-2 text-sm text-danger">{error}</p>}

            {!readOnly && !adding && (
                <button
                    type="button"
                    data-demo-guide="add-item"
                    onClick={() => setAdding(true)}
                    className="mt-3 text-sm text-subtle hover:text-foreground hover:cursor-pointer"
                >
                    + Add line item
                </button>
            )}

            {!readOnly && adding && (
                <div
                    className="mt-3 flex flex-col gap-2"
                    onBlur={(e) => {
                        if (!description.trim() && !e.currentTarget.contains(e.relatedTarget)) setAdding(false);
                    }}
                >
                    <input
                        ref={inputRef}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") handleAddItem();
                        }}
                        data-demo-guide="item-input"
                        placeholder="Add work item"
                        autoFocus
                        className={inputClass}
                    />
                    <div className="flex gap-2">
                        <select value={priority} onChange={(e) => setPriority(e.target.value)} className={inputClass}>
                            {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                                <option key={value} value={value}>
                                    {label}
                                </option>
                            ))}
                        </select>

                        <button
                            type="button"
                            onClick={handleAddItem}
                            disabled={pending || !description.trim()}
                            className="shrink-0 rounded-md border border-line-strong px-4 py-2 text-sm text-foreground hover:bg-surface-hover hover:cursor-pointer disabled:opacity-40"
                        >
                            {pending ? "Adding..." : "Add"}
                        </button>

                        <button
                            type="button"
                            onClick={() => setAdding(false)}
                            className="shrink-0 px-2 text-sm text-subtle hover:text-foreground hover:cursor-pointer"
                        >
                            Done
                        </button>
                    </div>
                </div>
            )}
        </li>
    );
}
