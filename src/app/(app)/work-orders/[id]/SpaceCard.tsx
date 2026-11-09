"use client";

import { useRef, useState } from "react";
import { addLineItem, removeLineItem, moveLineItem, updateLineItem } from "../actions";
import { LineItemPriority } from "@/generated/prisma/enums";
import { inputClass, PRIORITY_LABELS } from "@/lib/defaults";
import { formatShortDate } from "@/lib/dates";
import { cardClass, iconButtonClass } from "@/lib/ui";
import { Button } from "@/components/Button";
import ActionMenu, { type MenuAction } from "@/components/ActionMenu";
import { PriorityBadge } from "@/components/StatusBadge";
import {
    ArrowDownIcon,
    ArrowUpIcon,
    CameraIcon,
    CheckIcon,
    ChevronDownIcon,
    PencilIcon,
    PlusIcon,
    TrashIcon,
} from "@/components/Icons";
import LineItemPhoto, { type PhotoHandle } from "./LineItemPhoto";
import { MAX_LINE_ITEM_PHOTOS } from "@/lib/photos";

type LineItemRow = {
    id: string;
    description: string;
    priority: string;
    completed: boolean;
    completedAt: Date | null;
    contractorNotes: string | null;
    // The line item's photos, oldest first (at most MAX_LINE_ITEM_PHOTOS).
    attachments: { id: string }[];
};

type AreaRow = {
    id: string;
    name: string;
    lineItems: LineItemRow[];
};

type ItemActions = {
    addLineItem: (areaId: string, description: string, priority: LineItemPriority) => Promise<unknown>;
    removeLineItem: (id: string) => Promise<unknown>;
    moveLineItem: (id: string, direction: "up" | "down") => Promise<unknown>;
    updateLineItem: (id: string, description: string, priority: LineItemPriority) => Promise<unknown>;
};

// One area of a work order (a room, the roof…) with its line items. Every change to an area or an item goes through
// its "⋯" menu, so the controls are the same with a mouse, a keyboard or a finger.
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
    building = false,
    onToggleItem,
}: {
    area: AreaRow;
    // A draft being written: shows "3 items" instead of "0 of 3 done", and no done marks.
    building?: boolean;
    index: number;
    total: number;
    onMove: (id: string, direction: "up" | "down") => void;
    onRemove: (id: string) => void;
    onRename: (id: string, name: string) => Promise<unknown> | void;
    busy: boolean;
    readOnly: boolean;
    actions?: ItemActions;
    showPhotos?: boolean;
    // Set on a started in-house work order: the done boxes become checkboxes the office can tick.
    onToggleItem?: (lineItemId: string, completed: boolean) => Promise<unknown>;
}): React.ReactElement {
    const [adding, setAdding] = useState(false);
    const [description, setDescription] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);
    const [priority, setPriority] = useState("MEDIUM");
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [renaming, setRenaming] = useState(false);
    const [nameDraft, setNameDraft] = useState("");
    const [confirmingArea, setConfirmingArea] = useState(false);
    // Set when Enter or Escape has already handled the rename, so the blur that follows doesn't save again.
    const skipNameBlur = useRef(false);
    const doneCount = area.lineItems.filter((i) => i.completed).length;
    const allDone = area.lineItems.length > 0 && doneCount === area.lineItems.length;
    const headingId = `area-${area.id}`;
    // Any area with items can be folded to its header; a finished one starts folded, so long work orders get
    // shorter as the work gets done. An area with no items is never folded (its "Add item" must stay reachable).
    const [foldChoice, setFoldChoice] = useState(allDone);
    const folded = foldChoice && area.lineItems.length > 0;
    const itemsId = `area-items-${area.id}`;

    function startRename() {
        skipNameBlur.current = false;
        setNameDraft(area.name);
        setRenaming(true);
    }

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
            setError("Couldn't rename that area. Try again.");
        }
    }

    // Returns whether the item was added. `close` closes the box afterwards ("Add and close") instead of keeping it
    // open for the next item.
    async function handleAddItem(close = false): Promise<boolean> {
        const trimmed = description.trim();
        // Pressing Enter again while it's saving would add it twice.
        if (!trimmed || pending) return false;

        setPending(true);
        try {
            await actions.addLineItem(area.id, trimmed, priority as LineItemPriority);
            setDescription("");
            setPriority("MEDIUM");
            setError(null);
            if (close) setAdding(false);
            return true;
        } catch {
            setError("Couldn't add that item. Try again.");
            return false;
        } finally {
            setPending(false);
            if (!close) inputRef.current?.focus();
        }
    }

    const areaActions: MenuAction[] = [
        { label: "Rename area", icon: <PencilIcon size={15} />, onSelect: startRename },
        {
            label: "Move up",
            icon: <ArrowUpIcon size={15} />,
            onSelect: () => onMove(area.id, "up"),
            disabled: index === 0 || busy,
        },
        {
            label: "Move down",
            icon: <ArrowDownIcon size={15} />,
            onSelect: () => onMove(area.id, "down"),
            disabled: index === total - 1 || busy,
        },
        {
            label: "Remove area",
            icon: <TrashIcon size={15} />,
            onSelect: () => setConfirmingArea(true),
            danger: true,
            disabled: busy,
        },
    ];

    return (
        <li aria-labelledby={headingId} className={cardClass}>
            <div
                className={`flex items-center gap-2 bg-surface-hover/40 py-1.5 pr-1.5 pl-4 ${folded ? "rounded-xl" : "rounded-t-xl border-b border-line"}`}
            >
                <h3 id={headingId} className="flex min-w-0 flex-1 items-center gap-2 font-semibold">
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
                            className={`${inputClass} h-9 py-1 font-semibold`}
                        />
                    ) : (
                        <span className="min-w-0 [overflow-wrap:anywhere]">{area.name}</span>
                    )}
                    {area.lineItems.length > 0 && !renaming && (
                        <span
                            className={`inline-flex shrink-0 items-center gap-1 text-[0.8125rem] font-normal ${allDone && !building ? "text-success" : "text-muted"}`}
                        >
                            {building ? (
                                `${area.lineItems.length} ${area.lineItems.length === 1 ? "item" : "items"}`
                            ) : (
                                <>
                                    {allDone && <CheckIcon size={12} />}
                                    {doneCount} of {area.lineItems.length} done
                                </>
                            )}
                        </span>
                    )}
                </h3>
                {area.lineItems.length > 0 && !renaming && !building && (
                    // A chevron beside the menu, so a long area name keeps the room.
                    <button
                        type="button"
                        onClick={() => setFoldChoice(!folded)}
                        aria-expanded={!folded}
                        aria-controls={itemsId}
                        aria-label={`${folded ? "Show" : "Hide"} the items in ${area.name}`}
                        title={folded ? "Show items" : "Hide items"}
                        className={iconButtonClass({ size: "sm" })}
                    >
                        <ChevronDownIcon size={15} className={folded ? "" : "rotate-180"} />
                    </button>
                )}
                {!readOnly && <ActionMenu label={`Actions for ${area.name}`} actions={areaActions} />}
            </div>

            {confirmingArea && !readOnly && (
                <ConfirmStrip
                    message={
                        area.lineItems.length > 0
                            ? `Remove “${area.name}” and its ${area.lineItems.length} ${area.lineItems.length === 1 ? "item" : "items"}? Their photos and notes are deleted too.`
                            : `Remove “${area.name}”?`
                    }
                    confirmLabel="Remove area"
                    pending={busy}
                    onConfirm={() => {
                        setConfirmingArea(false);
                        onRemove(area.id);
                    }}
                    onCancel={() => setConfirmingArea(false)}
                />
            )}

            {area.lineItems.length > 0 && !folded && (
                <ul id={itemsId} className="divide-y divide-line px-4">
                    {area.lineItems.map((item, i) => (
                        <ItemRow
                            key={item.id}
                            item={item}
                            first={i === 0}
                            last={i === area.lineItems.length - 1}
                            readOnly={readOnly}
                            showPhotos={showPhotos}
                            actions={actions}
                            building={building}
                            onToggleItem={onToggleItem}
                        />
                    ))}
                </ul>
            )}

            {error && (
                <p role="alert" className="px-4 pb-3 text-sm text-danger">
                    {error}
                </p>
            )}

            {!readOnly && !adding && !folded && (
                <div className="border-t border-line px-2 py-1.5">
                    <Button
                        variant="ghost"
                        size="sm"
                        data-demo-guide="add-item"
                        onClick={() => setAdding(true)}
                        className="text-accent hover:text-accent-hover"
                    >
                        <PlusIcon />
                        Add item
                    </Button>
                </div>
            )}

            {!readOnly && adding && (
                <div
                    className="rounded-b-xl border-t border-line bg-background/30 px-4 py-3"
                    onBlur={(e) => {
                        if (!description.trim() && !e.currentTarget.contains(e.relatedTarget)) setAdding(false);
                    }}
                >
                    <label className="block text-sm font-medium text-secondary" htmlFor={`new-item-${area.id}`}>
                        New item in {area.name}
                    </label>
                    <input
                        id={`new-item-${area.id}`}
                        ref={inputRef}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") handleAddItem();
                            if (e.key === "Escape") setAdding(false);
                        }}
                        data-demo-guide="item-input"
                        placeholder="Describe the work, e.g. Replace the faucet cartridge"
                        maxLength={1000}
                        autoFocus
                        className={`${inputClass} mt-1`}
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        <select
                            value={priority}
                            onChange={(e) => setPriority(e.target.value)}
                            aria-label="Priority"
                            className={`${inputClass} w-auto`}
                        >
                            {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                                <option key={value} value={value}>
                                    {label} priority
                                </option>
                            ))}
                        </select>
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleAddItem()}
                            disabled={!description.trim()}
                            pending={pending}
                            pendingLabel="Adding…"
                        >
                            Add item
                        </Button>
                        {/* With text typed, closing would lose it, so this button adds it first. */}
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={pending}
                            onClick={() => (description.trim() ? handleAddItem(true) : setAdding(false))}
                        >
                            {description.trim() ? "Add and close" : "Done"}
                        </Button>
                    </div>
                </div>
            )}
        </li>
    );
}

// One line item: its done mark, the description, priority and done date, the photo and the contractor's note, and
// a "⋯" menu with everything you can change.
function ItemRow({
    item,
    first,
    last,
    readOnly,
    showPhotos,
    actions,
    building,
    onToggleItem,
}: {
    item: LineItemRow;
    first: boolean;
    last: boolean;
    readOnly: boolean;
    showPhotos: boolean;
    actions: ItemActions;
    building: boolean;
    onToggleItem?: (lineItemId: string, completed: boolean) => Promise<unknown>;
}): React.ReactElement {
    const photoRef = useRef<PhotoHandle>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState(false);
    const [editDraft, setEditDraft] = useState(item.description);
    const [editPriority, setEditPriority] = useState(item.priority);
    const [confirming, setConfirming] = useState(false);
    const hasPhoto = item.attachments.length > 0;

    async function run(fn: () => Promise<unknown>, failure: string) {
        setBusy(true);
        try {
            await fn();
            setError(null);
            return true;
        } catch {
            setError(failure);
            return false;
        } finally {
            setBusy(false);
        }
    }

    function startEdit() {
        setEditDraft(item.description);
        setEditPriority(item.priority);
        setConfirming(false);
        setEditing(true);
    }

    // Closing the inline editor puts focus back on the item's "⋯" button, where the edit was started.
    const menuButtonId = `item-menu-${item.id}`;
    function closeEdit() {
        setEditing(false);
        requestAnimationFrame(() => document.getElementById(menuButtonId)?.focus());
    }

    async function saveEdit() {
        const trimmed = editDraft.trim();
        if (!trimmed || (trimmed === item.description && editPriority === item.priority)) {
            closeEdit();
            return;
        }
        const ok = await run(
            () => actions.updateLineItem(item.id, trimmed, editPriority as LineItemPriority),
            "Couldn't save that change. Try again.",
        );
        if (ok) closeEdit();
    }

    const menu: MenuAction[] = [
        { label: "Edit", icon: <PencilIcon size={15} />, onSelect: startEdit },
        ...(showPhotos && item.attachments.length < MAX_LINE_ITEM_PHOTOS
            ? [{ label: "Add photo", icon: <CameraIcon size={15} />, onSelect: () => photoRef.current?.pick() }]
            : []),
        {
            label: "Move up",
            icon: <ArrowUpIcon size={15} />,
            disabled: first || busy,
            onSelect: () => run(() => actions.moveLineItem(item.id, "up"), "Couldn't move that item."),
        },
        {
            label: "Move down",
            icon: <ArrowDownIcon size={15} />,
            disabled: last || busy,
            onSelect: () => run(() => actions.moveLineItem(item.id, "down"), "Couldn't move that item."),
        },
        {
            label: "Remove item",
            icon: <TrashIcon size={15} />,
            danger: true,
            disabled: busy,
            onSelect: () => setConfirming(true),
        },
    ];

    return (
        <li className="py-3">
            <div className="flex items-start gap-3">
                {!building && (
                    <DoneMark
                        item={item}
                        busy={busy}
                        onToggle={
                            onToggleItem
                                ? () =>
                                      run(
                                          () => onToggleItem(item.id, !item.completed),
                                          "Couldn't update that item. Try again.",
                                      )
                                : undefined
                        }
                    />
                )}
                <div className="min-w-0 flex-1">
                    {editing ? (
                        <div
                            className="flex flex-col gap-2"
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") saveEdit();
                                if (e.key === "Escape") closeEdit();
                            }}
                        >
                            <input
                                value={editDraft}
                                onChange={(e) => setEditDraft(e.target.value)}
                                autoFocus
                                maxLength={1000}
                                aria-label="Description"
                                className={inputClass}
                            />
                            <div className="flex flex-wrap items-center gap-2">
                                <select
                                    value={editPriority}
                                    onChange={(e) => setEditPriority(e.target.value)}
                                    aria-label="Priority"
                                    className={`${inputClass} w-auto`}
                                >
                                    {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                                        <option key={value} value={value}>
                                            {label} priority
                                        </option>
                                    ))}
                                </select>
                                <Button size="sm" variant="primary" onClick={saveEdit} pending={busy} pendingLabel="Saving…">
                                    Save
                                </Button>
                                <Button size="sm" variant="ghost" onClick={closeEdit}>
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <p
                            className={`text-[0.9375rem] leading-6 [overflow-wrap:anywhere] ${item.completed ? "text-muted" : "text-foreground"}`}
                        >
                            {item.description}
                        </p>
                    )}

                    {!editing && (item.priority === "EMERGENCY" || item.priority === "HIGH" || item.completedAt) && (
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                            <PriorityBadge priority={item.priority} />
                            {item.completedAt && (
                                <span
                                    suppressHydrationWarning
                                    className="inline-flex items-center gap-1 text-[0.8125rem] font-medium text-success"
                                >
                                    <CheckIcon size={12} />
                                    Done {formatShortDate(new Date(item.completedAt))}
                                </span>
                            )}
                        </div>
                    )}
                    {showPhotos && (
                        <LineItemPhoto
                            ref={photoRef}
                            lineItemId={item.id}
                            description={item.description}
                            photoIds={item.attachments.map((a) => a.id)}
                            readOnly={readOnly}
                        />
                    )}
                    {item.contractorNotes && (
                        <p className="mt-2 whitespace-pre-line rounded-md border-l-2 border-accent/50 bg-surface-hover/50 px-3 py-2 text-sm text-secondary">
                            <span className="block text-[0.8125rem] font-medium text-muted">Contractor note</span>
                            {item.contractorNotes}
                        </p>
                    )}
                </div>
                {!readOnly && !editing && (
                    // Always fully visible, like the area and unit menus, so the item's actions are never hidden.
                    <div className="-my-1 -mr-1.5 shrink-0">
                        <ActionMenu
                            label={`Actions for “${item.description}”`}
                            actions={menu}
                            buttonId={menuButtonId}
                        />
                    </div>
                )}
            </div>
            {confirming && (
                <ConfirmStrip
                    inset
                    message={`Remove this item?${hasPhoto || item.contractorNotes ? " Its photos and notes are deleted too." : ""}`}
                    confirmLabel="Remove"
                    pending={busy}
                    onConfirm={async () => {
                        const ok = await run(
                            () => actions.removeLineItem(item.id),
                            "Couldn't remove that item. Try again.",
                        );
                        if (ok) setConfirming(false);
                    }}
                    onCancel={() => setConfirming(false)}
                />
            )}
            {error && (
                <p role="alert" className="mt-2 text-sm text-danger">
                    {error}
                </p>
            )}
        </li>
    );
}

// Beside each item: a checkbox the office can tick on started in-house work orders, otherwise a round, read-only
// mark that shows whether the contractor has checked it off (so it's not mistaken for something to click).
function DoneMark({
    item,
    busy,
    onToggle,
}: {
    item: LineItemRow;
    busy: boolean;
    onToggle?: () => void;
}): React.ReactElement {
    if (onToggle) {
        return (
            <button
                type="button"
                role="checkbox"
                aria-checked={item.completed}
                aria-label={`Done: ${item.description}`}
                onClick={onToggle}
                disabled={busy}
                className="-m-2 flex shrink-0 rounded-md p-2 hover:cursor-pointer disabled:opacity-50 [&:hover>span]:border-success"
            >
                <span
                    className={`flex h-[22px] w-[22px] items-center justify-center rounded-md border-2 transition-colors ${
                        item.completed ? "border-success bg-success text-background" : "border-line-strong bg-surface"
                    }`}
                >
                    {item.completed && <CheckIcon size={14} strokeWidth={3} />}
                </span>
            </button>
        );
    }

    // Read-only (the contractor checks these off): the same rounded square as a checkbox once done, and a plain dash
    // before, which reads as "not yet" without looking like something to click.
    return (
        <span
            role="img"
            aria-label={item.completed ? "Checked off" : "Not checked off yet"}
            title={item.completed ? "Checked off" : "Not checked off yet"}
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${
                item.completed ? "bg-success/15 text-success" : ""
            }`}
        >
            {item.completed ? (
                <CheckIcon size={12} strokeWidth={3} />
            ) : (
                <span aria-hidden className="h-0.5 w-2.5 rounded-full bg-line-strong" />
            )}
        </span>
    );
}

// A yes/no question in place, for removing an area or an item.
function ConfirmStrip({
    message,
    confirmLabel,
    pending,
    onConfirm,
    onCancel,
    inset = false,
}: {
    message: string;
    confirmLabel: string;
    pending: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    inset?: boolean;
}): React.ReactElement {
    return (
        <div
            role="group"
            aria-label={message}
            className={`flex flex-wrap items-center justify-between gap-3 border-danger/30 bg-danger/5 px-4 py-3 ${
                inset ? "mt-3 rounded-lg border" : "border-b"
            }`}
        >
            <p className="text-sm text-foreground">{message}</p>
            <div className="flex gap-2">
                <Button size="sm" onClick={onCancel} disabled={pending}>
                    Keep
                </Button>
                <Button size="sm" variant="danger" onClick={onConfirm} pending={pending} pendingLabel="Removing…" autoFocus>
                    {confirmLabel}
                </Button>
            </div>
        </div>
    );
}
