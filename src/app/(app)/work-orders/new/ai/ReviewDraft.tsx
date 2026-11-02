"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { inputClass, labelClass, PRIORITY_LABELS, PRIORITY_STYLES, unitLabel } from "@/lib/defaults";
import type { ContractorOption, PropertyOption } from "@/lib/workOrderLookup";
import type { MatchResult } from "@/lib/workOrderMatch";
import { createDraftFromBot } from "./actions";
import type { ParseState } from "./schemas";

type Props = {
    result: NonNullable<ParseState["result"]>;
    properties: PropertyOption[];
    contractors: ContractorOption[];
    // Called before creating (to clear the saved description) and if creating fails (to save it again).
    onCreateStart: () => void;
    onCreateFailed: () => void;
};

const matchedId = <T extends { id: string }>(match: MatchResult<T> | null) =>
    match?.status === "matched" ? match.match.id : "";

// A chosen ID that's no longer in the list (archived or deleted since the page loaded) counts as not chosen.
const stillListed = <T extends { id: string }>(id: string, list: T[]) =>
    list.some((item) => item.id === id) ? id : "";

const propertyLabel = (p: PropertyOption) =>
    p.displayName === p.addressLine1 ? p.displayName : `${p.displayName} (${p.addressLine1})`;

const contractorLabel = (c: ContractorOption) =>
    c.company && c.company !== c.displayName ? `${c.displayName} (${c.company})` : c.displayName;

export default function ReviewDraft({ result, properties, contractors, onCreateStart, onCreateFailed }: Props) {
    const { draft, property: propertyMatch, contractor: contractorMatch } = result;

    const [propertyId, setPropertyId] = useState(matchedId(propertyMatch.property));
    const [unitId, setUnitId] = useState(matchedId(propertyMatch.unit));
    const [contractorId, setContractorId] = useState(matchedId(contractorMatch));
    const [title, setTitle] = useState(draft.title);
    const [dueDate, setDueDate] = useState(draft.dueDate ?? "");
    const [notes, setNotes] = useState(draft.notes ?? "");
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();
    const router = useRouter();
    const [refreshing, startRefresh] = useTransition();
    // Reloads the dropdown lists after adding a property or contractor in another tab; the review is kept.
    const refreshLists = () => startRefresh(() => router.refresh());

    const selectedPropertyId = stillListed(propertyId, properties);
    const units = properties.find((p) => p.id === selectedPropertyId)?.units ?? [];
    const selectedUnitId = stillListed(unitId, units);
    const effectiveUnitId = units.length === 1 ? units[0].id : selectedUnitId || null;
    const selectedContractorId = stillListed(contractorId, contractors);

    function changeProperty(id: string) {
        setPropertyId(id);
        // Keep the matched unit only if the user goes back to the matched property.
        setUnitId(id === matchedId(propertyMatch.property) ? matchedId(propertyMatch.unit) : "");
    }

    function create() {
        setError(null);
        startTransition(async () => {
            onCreateStart();
            const response = await createDraftFromBot({
                propertyId: selectedPropertyId,
                unitId: effectiveUnitId,
                contractorId: selectedContractorId || null,
                title,
                notes,
                dueDate: dueDate || null,
                areas: draft.areas,
            });
            // On success the action opens the new work order, so only a failure comes back here.
            if (response?.ok === false) {
                setError(response.error);
                onCreateFailed();
                // In case a property, unit or contractor was archived meanwhile: it drops out of the lists.
                refreshLists();
            }
        });
    }

    return (
        <section className="flex flex-col gap-5 rounded-lg border border-line p-4">
            <h2 className="text-lg font-semibold">Review your work order</h2>

            <MatchField
                label="Property"
                match={propertyMatch.property}
                spokenText={draft.propertyText}
                noun="property"
                options={properties}
                optionLabel={propertyLabel}
                value={selectedPropertyId}
                onChange={changeProperty}
                addHref="/properties/new"
                onRefresh={refreshLists}
                refreshing={refreshing}
            />

            {units.length > 1 && (
                <label className={labelClass}>
                    Unit
                    {draft.unitText && !selectedUnitId && (
                        <span className="block text-xs font-normal text-warning">
                            No unit matches &ldquo;{draft.unitText}.&rdquo; Choose one, or leave it empty.
                        </span>
                    )}
                    <select value={selectedUnitId} onChange={(e) => setUnitId(e.target.value)} className={inputClass}>
                        <option value="">No unit</option>
                        {units.map((unit) => (
                            <option key={unit.id} value={unit.id}>
                                {unitLabel(unit.name)}
                            </option>
                        ))}
                    </select>
                </label>
            )}

            <MatchField
                label="Contractor"
                match={contractorMatch}
                spokenText={draft.contractorText}
                noun="contractor"
                options={contractors}
                optionLabel={contractorLabel}
                value={selectedContractorId}
                onChange={setContractorId}
                emptyOption="No contractor yet"
                addHref="/contacts/new"
                onRefresh={refreshLists}
                refreshing={refreshing}
            />

            <label className={labelClass}>
                Title
                <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
            </label>

            <label className={labelClass}>
                Due date
                {draft.dueDateText && (
                    <span className="block text-xs font-normal text-warning">
                        You said &ldquo;{draft.dueDateText}.&rdquo;{" "}
                        {draft.dueDate ? "Check this date." : "Choose the date."}
                    </span>
                )}
                <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className={inputClass}
                />
            </label>

            <label className={labelClass}>
                Notes for the contractor
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputClass} />
            </label>

            <div className="flex flex-col gap-3">
                <p className={labelClass}>Work</p>
                {draft.areas.map((area, areaIndex) => (
                    <div key={areaIndex}>
                        <h3 className="text-sm font-medium text-foreground">{area.name}</h3>
                        <ul className="mt-1 flex flex-col gap-1">
                            {area.lineItems.map((item, itemIndex) => (
                                <li key={itemIndex} className="flex items-start gap-2 text-sm text-secondary">
                                    <span>• {item.description}</span>
                                    {PRIORITY_STYLES[item.priority] && (
                                        <span
                                            className={`ml-auto shrink-0 rounded-full border px-2 py-0.5 text-xs ${PRIORITY_STYLES[item.priority]}`}
                                        >
                                            {PRIORITY_LABELS[item.priority]}
                                        </span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
                <p className="text-xs text-subtle">
                    You can edit, reorder and add photos to these after creating the draft.
                </p>
            </div>

            {error && (
                <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
            )}
            <button
                type="button"
                onClick={create}
                disabled={pending || !selectedPropertyId || !title.trim()}
                className="self-start rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover hover:cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
            >
                {pending ? "Creating draft…" : "Create draft"}
            </button>
        </section>
    );
}

type MatchFieldProps<T extends { id: string }> = {
    label: string;
    match: MatchResult<T>;
    spokenText: string | null;
    noun: string;
    options: T[];
    optionLabel: (option: T) => string;
    value: string;
    onChange: (id: string) => void;
    emptyOption?: string;
    addHref: string;
    onRefresh: () => void;
    refreshing: boolean;
};

// Shows a matched record with a "Change" link, or a dropdown with a note when nothing (or more than one) matched.
function MatchField<T extends { id: string }>({
    label,
    match,
    spokenText,
    noun,
    options,
    optionLabel,
    value,
    onChange,
    emptyOption,
    addHref,
    onRefresh,
    refreshing,
}: MatchFieldProps<T>) {
    const [changing, setChanging] = useState(false);
    const candidates = match.status === "ambiguous" ? match.candidates : [];
    const others = options.filter((option) => !candidates.some((candidate) => candidate.id === option.id));

    // `value` only holds IDs still in the list, so a matched record that was archived meanwhile shows the dropdown.
    const matchGone = match.status === "matched" && !changing && value !== match.match.id;

    if (match.status === "matched" && !changing && !matchGone) {
        return (
            <div className={labelClass}>
                {label}
                <p className="mt-1 flex items-center gap-3 text-sm font-normal text-foreground">
                    <span className="text-success">✓</span>
                    {optionLabel(match.match)}
                    <button
                        type="button"
                        onClick={() => setChanging(true)}
                        className="text-xs text-muted underline hover:text-foreground hover:cursor-pointer"
                    >
                        Change
                    </button>
                </p>
            </div>
        );
    }

    let note: ReactNode = null;
    if (matchGone) {
        note = `That ${noun} is no longer available. Choose one:`;
    } else if (match.status === "ambiguous") {
        note = `More than one ${noun} matches “${spokenText}.” Choose one:`;
    } else if (match.status === "notFound") {
        note = spokenText ? `No ${noun} matches “${spokenText}.” Choose one:` : `No ${noun} was mentioned. Choose one:`;
    }

    return (
        <div>
            <label className={labelClass}>
                {label}
                {note && <span className="block text-xs font-normal text-warning">{note}</span>}
                <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
                    <option value="">{emptyOption ?? `Select a ${noun}`}</option>
                    {candidates.length > 0 ? (
                        <>
                            <optgroup label="Best matches">
                                {candidates.map((option) => (
                                    <option key={option.id} value={option.id}>
                                        {optionLabel(option)}
                                    </option>
                                ))}
                            </optgroup>
                            <optgroup label={`All ${noun === "property" ? "properties" : "contractors"}`}>
                                {others.map((option) => (
                                    <option key={option.id} value={option.id}>
                                        {optionLabel(option)}
                                    </option>
                                ))}
                            </optgroup>
                        </>
                    ) : (
                        options.map((option) => (
                            <option key={option.id} value={option.id}>
                                {optionLabel(option)}
                            </option>
                        ))
                    )}
                </select>
            </label>
            {/* A new tab, so this page and the review stay as they are. */}
            <p className="mt-1 flex gap-4 text-xs">
                <a href={addHref} target="_blank" rel="noopener" className="text-muted underline hover:text-foreground">
                    Add a new {noun} ↗
                </a>
                <button
                    type="button"
                    onClick={onRefresh}
                    disabled={refreshing}
                    className="text-muted underline hover:text-foreground hover:cursor-pointer disabled:no-underline"
                >
                    {refreshing ? "Refreshing…" : "Refresh list"}
                </button>
            </p>
        </div>
    );
}
