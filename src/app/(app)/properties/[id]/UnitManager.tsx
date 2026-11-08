"use client";

import { useState } from "react";
import { addUnit, renameUnit, archiveUnit, deleteUnit } from "../actions";
import { inputClass } from "@/lib/defaults";
import DeleteButton from "@/components/DeleteButton";

type UnitRow = {
    id: string;
    name: string;
    openCount: number;
    workOrderCount: number;
    tenantCount: number;
};
type Result = { ok: true } | { ok: false; error: string };

const smallButton =
    "shrink-0 rounded-md border border-line-strong px-3 py-1.5 text-sm text-foreground hover:bg-surface-hover hover:cursor-pointer disabled:opacity-40 disabled:hover:cursor-not-allowed";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default function UnitManager({ propertyId, units }: { propertyId: string; units: UnitRow[] }) {
    return (
        <div className="flex flex-col gap-3">
            {units.map((unit) => (
                <UnitCard key={unit.id} unit={unit} canArchive={units.length > 1} />
            ))}
            <AddInput
                placeholder="Unit name (Unit C, Apt 102…)"
                buttonLabel="+ Add unit"
                onAdd={(name) => addUnit(propertyId, name)}
            />
        </div>
    );
}

function UnitCard({ unit, canArchive }: { unit: UnitRow; canArchive: boolean }) {
    const [confirming, setConfirming] = useState(false);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleArchive() {
        setPending(true);
        const res = await archiveUnit(unit.id);
        setPending(false);
        if (!res.ok) {
            setError(res.error);
            setConfirming(false);
        }
    }

    return (
        <div className="rounded-lg border border-line bg-surface p-4">
            <div className={canArchive ? "mb-3" : undefined}>
                <InlineName
                    value={unit.name}
                    onSave={(name) => renameUnit(unit.id, name)}
                    className="font-medium"
                    label="unit name"
                />
            </div>

            {canArchive && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                    {unit.openCount > 0 ? (
                        <p className="text-subtle">
                            Can&apos;t archive: {plural(unit.openCount, "open work order", "open work orders")}. Close
                            or cancel {unit.openCount === 1 ? "it" : "them"} first.
                        </p>
                    ) : confirming ? (
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-secondary">
                                Archive {unit.name}?
                                {unit.tenantCount > 0 &&
                                    ` ${plural(unit.tenantCount, "tenant", "tenants")} will be unlinked from this unit but stay in Contacts.`}
                            </span>
                            <button
                                type="button"
                                onClick={handleArchive}
                                disabled={pending}
                                className="text-danger hover:text-danger/80 hover:cursor-pointer disabled:opacity-40"
                            >
                                {pending ? "Archiving..." : "Yes, archive"}
                            </button>
                            <button
                                type="button"
                                onClick={() => setConfirming(false)}
                                disabled={pending}
                                className="text-subtle hover:text-foreground hover:cursor-pointer"
                            >
                                Go back
                            </button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => {
                                setError(null);
                                setConfirming(true);
                            }}
                            className="text-subtle hover:text-danger hover:cursor-pointer"
                        >
                            Archive unit
                        </button>
                    )}
                    {!confirming && (
                        <DeleteButton
                            itemName={unit.name}
                            label="Delete unit"
                            onDelete={(confirmation) => deleteUnit(unit.id, confirmation)}
                            archiveInstead={
                                unit.openCount === 0
                                    ? () => {
                                          setError(null);
                                          setConfirming(true);
                                      }
                                    : undefined
                            }
                            triggerClassName="text-subtle hover:text-danger hover:cursor-pointer"
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
                                    {plural(unit.tenantCount, "tenant", "tenants")} will be unlinked but stay in
                                    Contacts.
                                </p>
                            )}
                        </DeleteButton>
                    )}
                    {error && <p className="basis-full text-danger">{error}</p>}
                </div>
            )}
        </div>
    );
}

function InlineName({
    value,
    onSave,
    className,
    label,
}: {
    value: string;
    onSave: (name: string) => Promise<Result>;
    className: string;
    label: string;
}) {
    const [editing, setEditing] = useState(false);
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
                className={`${className} rounded px-1 -mx-1 text-left hover:bg-surface-hover hover:cursor-text`}
                aria-label={`Rename ${value}`}
            >
                {value}
            </button>
        );
    }

    return (
        <span className="flex flex-col gap-1">
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
                aria-label={`Edit ${label}`}
                className="rounded border border-faint bg-surface-hover px-2 py-0.5 text-sm text-foreground focus:outline-none"
            />
            {error && <span className="text-xs text-danger">{error}</span>}
        </span>
    );
}

function AddInput({
    placeholder,
    buttonLabel,
    onAdd,
}: {
    placeholder: string;
    buttonLabel: string;
    onAdd: (name: string) => Promise<Result>;
}) {
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
        <div className="flex flex-col gap-1">
            <div className="flex gap-2">
                <input
                    value={name}
                    onChange={(e) => {
                        setName(e.target.value);
                        setError(null);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") handleAdd();
                    }}
                    placeholder={placeholder}
                    maxLength={100}
                    className={`${inputClass} py-1.5`}
                />
                <button type="button" onClick={handleAdd} disabled={pending || !name.trim()} className={smallButton}>
                    {pending ? "Adding..." : buttonLabel}
                </button>
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
        </div>
    );
}
