"use client";

import { useId, useRef, useState } from "react";
import { addUnit, renameUnit, archiveUnit, deleteUnit } from "../actions";
import { inputClass } from "@/lib/defaults";
import { cardClass } from "@/lib/ui";
import DeleteButton from "@/components/DeleteButton";
import ActionMenu, { type MenuAction } from "@/components/ActionMenu";
import { Button } from "@/components/Button";
import { useToast } from "@/components/Toaster";
import { ArchiveIcon, PencilIcon, PlusIcon, TrashIcon } from "@/components/Icons";

type UnitRow = {
    id: string;
    name: string;
    openCount: number;
    workOrderCount: number;
    tenantCount: number;
};
type Result = { ok: true } | { ok: false; error: string };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// The property's units as a compact list: the name (click to rename), what's attached to it, and its Archive and
// Delete buttons. The field to add a unit sits under the list.
export default function UnitManager({ propertyId, units }: { propertyId: string; units: UnitRow[] }) {
    return (
        <div className="flex flex-col gap-3">
            <ul className={`${cardClass} divide-y divide-line`}>
                {units.map((unit) => (
                    <UnitRowItem key={unit.id} unit={unit} canArchive={units.length > 1} />
                ))}
            </ul>
            <AddUnit onAdd={(name) => addUnit(propertyId, name)} />
        </div>
    );
}

function UnitRowItem({ unit, canArchive }: { unit: UnitRow; canArchive: boolean }) {
    const toast = useToast();
    const [confirming, setConfirming] = useState(false);
    const [renaming, setRenaming] = useState(false);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const openDelete = useRef<(() => void) | null>(null);

    async function handleArchive() {
        setPending(true);
        const res = await archiveUnit(unit.id);
        setPending(false);
        if (res.ok) {
            toast(`${unit.name} archived.`);
        } else {
            setError(res.error);
            setConfirming(false);
        }
    }

    const facts = [
        unit.openCount > 0
            ? plural(unit.openCount, "open work order", "open work orders")
            : null,
        unit.tenantCount > 0 ? plural(unit.tenantCount, "tenant", "tenants") : null,
    ].filter(Boolean);

    const menu: MenuAction[] = [
        { label: "Rename", icon: <PencilIcon size={15} />, onSelect: () => setRenaming(true) },
        ...(canArchive
            ? [
                  {
                      label: unit.openCount > 0 ? "Archive (close its open work first)" : "Archive",
                      icon: <ArchiveIcon size={15} />,
                      disabled: unit.openCount > 0,
                      onSelect: () => {
                          setError(null);
                          setConfirming(true);
                      },
                  },
                  {
                      label: "Delete",
                      icon: <TrashIcon size={15} />,
                      danger: true,
                      onSelect: () => openDelete.current?.(),
                  },
              ]
            : []),
    ];

    return (
        <li className="px-4 py-3 sm:px-5">
            <div className="flex items-center gap-x-4 gap-y-2">
                <div className="min-w-0 flex-1">
                    <InlineName
                        value={unit.name}
                        editing={renaming}
                        onEditingChange={setRenaming}
                        onSave={(name) => renameUnit(unit.id, name)}
                    />
                    <p className="text-[0.8125rem] text-muted">
                        {facts.length > 0 ? facts.join(" · ") : "Nothing attached"}
                    </p>
                </div>
                <ActionMenu label={`Actions for ${unit.name}`} actions={menu} />
                {canArchive && (
                    <DeleteButton
                        itemName={unit.name}
                        hideTrigger
                        openRef={openDelete}
                        requireTyping={unit.workOrderCount > 0 || unit.tenantCount > 0}
                        onDelete={(confirmation) => deleteUnit(unit.id, confirmation)}
                        archiveInstead={
                            unit.openCount === 0
                                ? () => {
                                      setError(null);
                                      setConfirming(true);
                                  }
                                : undefined
                        }
                    >
                        {unit.workOrderCount > 0 && (
                            <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-danger">
                                This also permanently deletes{" "}
                                <strong>{plural(unit.workOrderCount, "work order", "work orders")}</strong> for this
                                unit, <strong>including archived ones</strong>, and all of their photos.
                                {unit.openCount > 0 &&
                                    ` ${unit.openCount} ${unit.openCount === 1 ? "is" : "are"} still open; contractors who were sent a link will be emailed that it's cancelled.`}
                            </p>
                        )}
                        {unit.tenantCount > 0 && (
                            <p>
                                {plural(unit.tenantCount, "tenant", "tenants")} will be unlinked but stay in Contacts.
                            </p>
                        )}
                        {unit.workOrderCount === 0 && unit.tenantCount === 0 && (
                            <p>Nothing is attached to this unit, so nothing else is deleted.</p>
                        )}
                    </DeleteButton>
                )}
            </div>
            {confirming && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line-strong/70 bg-background/40 p-3">
                    <p className="text-sm text-foreground">
                        Archive {unit.name}?
                        {unit.tenantCount > 0 &&
                            ` ${plural(unit.tenantCount, "tenant", "tenants")} will be unlinked from it but stay in Contacts.`}
                    </p>
                    <div className="flex gap-2">
                        <Button size="sm" onClick={() => setConfirming(false)} disabled={pending}>
                            Go back
                        </Button>
                        <Button size="sm" variant="danger" onClick={handleArchive} pending={pending} pendingLabel="Archiving…">
                            Archive
                        </Button>
                    </div>
                </div>
            )}
            {error && (
                <p role="alert" className="mt-2 text-sm text-danger">
                    {error}
                </p>
            )}
        </li>
    );
}

// The unit's name, or a text field while renaming (opened from the unit's menu or by clicking the name).
function InlineName({
    value,
    editing,
    onEditingChange: setEditing,
    onSave,
}: {
    value: string;
    editing: boolean;
    onEditingChange: (editing: boolean) => void;
    onSave: (name: string) => Promise<Result>;
}) {
    const [draft, setDraft] = useState(value);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function save() {
        const name = draft.trim();
        if (!name || name === value) {
            setEditing(false);
            setDraft(value);
            return;
        }
        setPending(true);
        const res = await onSave(name);
        setPending(false);
        if (res.ok) {
            setEditing(false);
            setError(null);
        } else {
            setError(res.error);
        }
    }

    if (!editing) {
        return (
            <button
                type="button"
                onClick={() => {
                    setDraft(value);
                    setEditing(true);
                }}
                className="group/name -mx-1.5 inline-flex max-w-full items-center gap-1.5 rounded px-1.5 py-0.5 text-left font-medium text-foreground hover:cursor-pointer hover:bg-surface-hover"
            >
                <span className="truncate">{value}</span>
                <span className="shrink-0 text-subtle group-hover/name:text-foreground group-focus-visible/name:text-foreground">
                    <PencilIcon size={13} />
                </span>
                <span className="sr-only">(rename)</span>
            </button>
        );
    }

    return (
        <span className="flex max-w-xs flex-col gap-1">
            <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={save}
                onKeyDown={(e) => {
                    if (e.key === "Enter") save();
                    if (e.key === "Escape") {
                        setEditing(false);
                        setDraft(value);
                        setError(null);
                    }
                }}
                disabled={pending}
                autoFocus
                maxLength={100}
                aria-label={`New name for ${value}`}
                className={`${inputClass} h-9 py-1`}
            />
            {error && (
                <span role="alert" className="text-xs text-danger">
                    {error}
                </span>
            )}
        </span>
    );
}

function AddUnit({ onAdd }: { onAdd: (name: string) => Promise<Result> }) {
    const id = useId();
    const [name, setName] = useState("");
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleAdd() {
        if (!name.trim()) return;
        setPending(true);
        const res = await onAdd(name);
        setPending(false);
        if (res.ok) {
            setName("");
            setError(null);
        } else {
            setError(res.error);
        }
    }

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                handleAdd();
            }}
        >
            <label htmlFor={id} className="mb-1 block text-sm font-medium text-secondary">
                Add a unit
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
                <input
                    id={id}
                    value={name}
                    onChange={(e) => {
                        setName(e.target.value);
                        setError(null);
                    }}
                    placeholder="Unit C, Apt 102…"
                    maxLength={100}
                    className={inputClass}
                />
                {/* Always enabled; with no name it puts the cursor in the box instead. */}
                <Button
                    type="submit"
                    pending={pending}
                    pendingLabel="Adding…"
                    onClick={(e) => {
                        if (!name.trim()) {
                            e.preventDefault();
                            document.getElementById(id)?.focus();
                        }
                    }}
                >
                    <PlusIcon />
                    Add unit
                </Button>
            </div>
            {error && (
                <p role="alert" className="mt-1 text-sm text-danger">
                    {error}
                </p>
            )}
        </form>
    );
}
