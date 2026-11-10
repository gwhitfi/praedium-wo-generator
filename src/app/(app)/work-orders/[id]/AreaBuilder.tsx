"use client";

import { useState } from "react";
import { addArea, removeArea, moveArea, renameArea, setLineItemCompleted } from "../actions";
import { inputClass } from "@/lib/defaults";
import { resultError } from "@/lib/actionResult";
import { Button } from "@/components/Button";
import { useToast } from "@/components/Toaster";
import { InfoIcon, PlusIcon } from "@/components/Icons";
import { sectionTitleClass } from "@/lib/ui";
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

// The work itself: areas (rooms, the roof, the yard), each with its line items, and the field to add an area.
export default function AreaBuilder({
    workOrderId,
    areas,
    readOnly = false,
    canCheckOff = false,
    building = false,
    notice,
}: {
    workOrderId: string;
    areas: AreaRow[];
    readOnly?: boolean;
    // A started in-house work order: the office checks off the line items itself.
    canCheckOff?: boolean;
    // A draft still being written: item counts instead of "0 of N done", and no done marks.
    building?: boolean;
    notice?: string;
}): React.ReactElement {
    const toast = useToast();
    const [name, setName] = useState("");
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const itemCount = areas.reduce((sum, area) => sum + area.lineItems.length, 0);

    async function handleAdd() {
        const trimmed = name.trim();
        if (!trimmed) return;

        setPending(true);
        try {
            const refused = resultError(await addArea(workOrderId, trimmed));
            if (refused) {
                setError(refused);
                return;
            }
            setName("");
            setError(null);
        } catch {
            setError("Couldn't add that area. Try again.");
        } finally {
            setPending(false);
        }
    }

    async function handleMove(areaId: string, direction: "up" | "down") {
        setBusyId(areaId);
        try {
            const refused = resultError(await moveArea(areaId, direction));
            if (refused) setError(refused);
        } catch {
            setError("Couldn't move that area. Try again.");
        } finally {
            setBusyId(null);
        }
    }

    async function handleRemove(areaId: string) {
        setBusyId(areaId);
        try {
            const refused = resultError(await removeArea(areaId));
            if (refused) {
                setError(refused);
                return;
            }
            toast("Area removed.");
        } catch {
            setError("Couldn't remove that area. Try again.");
        } finally {
            setBusyId(null);
        }
    }

    // Errors and refusals reach SpaceCard, which shows them in the area's card.
    async function handleRename(areaId: string, newName: string) {
        setBusyId(areaId);
        try {
            return await renameArea(areaId, newName);
        } finally {
            setBusyId(null);
        }
    }

    return (
        <section aria-labelledby="work-title">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="work-title" className={sectionTitleClass}>
                    Work
                </h2>
                {itemCount > 0 && (
                    <p className="text-sm text-subtle">
                        {areas.length} {areas.length === 1 ? "area" : "areas"} · {itemCount}{" "}
                        {itemCount === 1 ? "item" : "items"}
                    </p>
                )}
            </div>
            {notice && (
                <p className="mt-2 flex items-center gap-2 text-sm text-muted">
                    <InfoIcon size={14} className="shrink-0 text-subtle" />
                    {notice}
                </p>
            )}
            {/* Phones: a row of links to each area, so a long work order doesn't mean scrolling past every room. */}
            {areas.length >= 3 && (
                // The right edge fades out, a hint that the row scrolls sideways when there are more areas.
                <nav
                    aria-label="Areas"
                    className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [mask-image:linear-gradient(to_right,black_calc(100%-2.5rem),transparent)] lg:hidden"
                >
                    {areas.map((area) => (
                        <a
                            key={area.id}
                            href={`#area-${area.id}`}
                            className="inline-flex h-10 shrink-0 items-center rounded-full border border-line-strong bg-surface px-3.5 text-sm text-secondary hover:text-foreground"
                        >
                            {area.name}
                        </a>
                    ))}
                </nav>
            )}

            {areas.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-line-strong/60 px-5 py-8 text-center">
                    <p className="text-sm font-medium text-foreground">
                        {readOnly ? "No work was listed on this work order." : "Add the first area"}
                    </p>
                    {!readOnly && (
                        <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
                            Group the work by where it happens, like Kitchen, Roof or Back yard. Then add the line
                            items for each one.
                        </p>
                    )}
                </div>
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
                            building={building}
                            onToggleItem={canCheckOff ? setLineItemCompleted : undefined}
                        />
                    ))}
                </ul>
            )}

            {!readOnly && (
                <form
                    className="mt-4"
                    onSubmit={(e) => {
                        e.preventDefault();
                        handleAdd();
                    }}
                >
                    <label htmlFor="new-area" className="mb-1 block text-sm font-medium text-secondary">
                        {areas.length === 0 ? "Area name" : "Add another area"}
                    </label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <input
                            id="new-area"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Kitchen, Roof, Back yard…"
                            maxLength={100}
                            className={inputClass}
                        />
                        {/* Always enabled, so it doesn't look broken at rest; with no name it puts the cursor in the
                            box instead (handleAdd ignores an empty name). */}
                        <Button
                            type="submit"
                            pending={pending}
                            pendingLabel="Adding…"
                            onClick={(e) => {
                                if (!name.trim()) {
                                    e.preventDefault();
                                    document.getElementById("new-area")?.focus();
                                }
                            }}
                        >
                            <PlusIcon />
                            Add area
                        </Button>
                    </div>
                    {error && (
                        <p role="alert" className="mt-2 text-sm text-danger">
                            {error}
                        </p>
                    )}
                </form>
            )}
        </section>
    );
}
