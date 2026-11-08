"use client";

import { useState } from "react";
import { addArea, removeArea, moveArea, renameArea, setLineItemCompleted } from "../actions";
import { inputClass } from "@/lib/defaults";
import SpaceCard from "./SpaceCard";

type AreaRow = {
    id: string;
    name: string;
    lineItems: {
        id: string;
        description: string;
        priority: string;
        completed: boolean;
        completedAt: Date | null;
        contractorNotes: string | null;
        attachments: { id: string }[];
    }[];
};

export default function AreaBuilder({
    workOrderId,
    areas,
    readOnly = false,
    canCheckOff = false,
    notice,
}: {
    workOrderId: string;
    areas: AreaRow[];
    readOnly?: boolean;
    // A started in-house work order: the office checks off the line items itself.
    canCheckOff?: boolean;
    notice?: string;
}) {
    const [name, setName] = useState("");
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    async function handleAdd() {
        const trimmed = name.trim();
        if (!trimmed) return;

        setPending(true);
        try {
            await addArea(workOrderId, trimmed);
            setName("");
            setError(null);
        } catch {
            setError("Could not add that area. Try again.");
        } finally {
            setPending(false);
        }
    }
    async function handleMove(areaId: string, direction: "up" | "down") {
        setBusyId(areaId);
        try {
            await moveArea(areaId, direction);
        } catch {
            setError("Could not move that area.");
        } finally {
            setBusyId(null);
        }
    }

    async function handleRemove(areaId: string) {
        setBusyId(areaId);
        try {
            await removeArea(areaId);
        } catch {
            setError("Could not remove that area.");
        } finally {
            setBusyId(null);
        }
    }

    // Errors reach SpaceCard, which shows them in the area's card.
    async function handleRename(areaId: string, newName: string) {
        setBusyId(areaId);
        try {
            await renameArea(areaId, newName);
        } finally {
            setBusyId(null);
        }
    }
    return (
        <div className="border-t border-line pt-6">
            <h2 className="text-lg font-semibold text-foreground">Areas</h2>
            {notice && (
                <p className="mt-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
                    {notice}
                </p>
            )}
            {!readOnly && (
                <>
                    <p className="mt-1 mb-4 text-sm text-subtle">Group the work by area: a room, the roof, the yard…</p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") handleAdd();
                            }}
                            placeholder="Area name (Kitchen, Roof, Back yard…)"
                            className={inputClass}
                        />
                        <button
                            type="button"
                            onClick={handleAdd}
                            disabled={pending || !name.trim()}
                            className="shrink-0 rounded-md border border-line-strong px-4 py-2 text-sm text-foreground hover:bg-surface-hover hover:cursor-pointer disabled:opacity-40 disabled:hover:cursor-not-allowed"
                        >
                            {pending ? "Adding..." : "Add area"}
                        </button>
                    </div>
                </>
            )}

            {error && <p className="mt-2 text-sm text-danger">{error}</p>}
            {areas.length === 0 ? (
                <p className="mt-4 text-sm text-subtle">
                    {readOnly ? "No areas on this work order." : "No areas added yet. Add one above."}
                </p>
            ) : (
                <ul className="mt-4 flex flex-col gap-4">
                    {areas.map((area, i) => (
                        <SpaceCard
                            key={area.id}
                            area={area}
                            index={i}
                            total={areas.length}
                            onMove={handleMove}
                            onRemove={handleRemove}
                            onRename={handleRename}
                            busy={busyId === area.id}
                            readOnly={readOnly}
                            onToggleItem={canCheckOff ? setLineItemCompleted : undefined}
                        />
                    ))}
                </ul>
            )}
        </div>
    );
}
