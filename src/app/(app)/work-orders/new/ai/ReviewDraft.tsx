"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import {
    assignableContactLabel,
    IN_HOUSE,
    IN_HOUSE_OPTION_LABEL,
    inputClass,
    labelClass,
    PRIORITY_LABELS,
    unitLabel,
} from "@/lib/defaults";
import { cardClass, iconButtonClass } from "@/lib/ui";
import { Button } from "@/components/Button";
import { TrashIcon, XIcon } from "@/components/Icons";
import type { LineItemPriority } from "@/generated/prisma/enums";
import Combobox from "@/components/form/Combobox";
import { ErrorSummary, Field } from "@/components/form/Field";
import { starredFirst, type ComboOption } from "@/lib/options";
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

type ReviewErrors = { propertyId?: string[]; title?: string[]; areas?: string[] };
const ERROR_LABELS = { propertyId: "Property", title: "Title", areas: "The work" };

const matchedId = <T extends { id: string }>(match: MatchResult<T> | null) =>
    match?.status === "matched" ? match.match.id : "";

// A chosen ID that's no longer in the list (archived or deleted since the page loaded) counts as not chosen.
const stillListed = <T extends { id: string }>(id: string, list: T[]) =>
    list.some((item) => item.id === id) ? id : "";

const propertyLabel = (p: PropertyOption) =>
    p.displayName === p.addressLine1 ? p.displayName : `${p.displayName} (${p.addressLine1})`;

const contractorLabel = (c: ContractorOption) => {
    const name = assignableContactLabel(c);
    return c.company && c.company !== c.displayName ? `${name} (${c.company})` : name;
};

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
    // IN_HOUSE means the office handles it itself: no contractor.
    const inHouse = contractorId === IN_HOUSE;
    const selectedContractorId = inHouse ? IN_HOUSE : stillListed(contractorId, contractors);

    // The areas and line items, editable before the draft is created.
    const [areas, setAreas] = useState(draft.areas);
    type DraftAreas = typeof draft.areas;
    const updateArea = (index: number, change: (area: DraftAreas[number]) => DraftAreas[number]) =>
        setAreas((current) => current.map((area, i) => (i === index ? change(area) : area)));
    const updateItem = (
        areaIndex: number,
        itemIndex: number,
        change: Partial<DraftAreas[number]["lineItems"][number]>,
    ) =>
        updateArea(areaIndex, (area) => ({
            ...area,
            lineItems: area.lineItems.map((item, i) => (i === itemIndex ? { ...item, ...change } : item)),
        }));
    // Removing an area's last item removes the area.
    const removeItem = (areaIndex: number, itemIndex: number) =>
        setAreas((current) =>
            current
                .map((area, i) =>
                    i === areaIndex
                        ? { ...area, lineItems: area.lineItems.filter((_, j) => j !== itemIndex) }
                        : area,
                )
                .filter((area) => area.lineItems.length > 0),
        );

    // What's missing, checked when "Create draft" is pressed, like the regular form: an error summary at the top and
    // a message on each field. The summary keeps what it found until the next press, so it doesn't move focus while
    // the user is fixing things; a field's own message goes away as soon as it's fixed.
    const firstEmpty = (() => {
        for (const [areaIndex, area] of areas.entries()) {
            if (!area.name.trim()) return { areaIndex, itemIndex: null };
            const itemIndex = area.lineItems.findIndex((item) => !item.description.trim());
            if (itemIndex >= 0) return { areaIndex, itemIndex };
        }
        return null;
    })();
    const currentErrors: ReviewErrors = {
        ...(selectedPropertyId ? {} : { propertyId: ["Choose a property"] }),
        ...(title.trim() ? {} : { title: ["Enter a title"] }),
        ...(firstEmpty ? { areas: ["Fill in or remove the empty area names and items"] } : {}),
    };
    const [submittedErrors, setSubmittedErrors] = useState<ReviewErrors | null>(null);
    const fieldError = (name: keyof ReviewErrors) => (submittedErrors?.[name] ? currentErrors[name] : undefined);

    function tryCreate() {
        if (Object.keys(currentErrors).length > 0) {
            setSubmittedErrors(currentErrors);
            return;
        }
        setSubmittedErrors(null);
        create();
    }

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
                contractorId: inHouse ? null : selectedContractorId || null,
                inHouse,
                title,
                notes,
                dueDate: dueDate || null,
                areas,
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
        <section aria-labelledby="review-title" className={`${cardClass} flex flex-col gap-5 p-5 sm:p-6`}>
            <div>
                <h2 id="review-title" className="text-lg font-semibold">
                    Check the draft
                </h2>
                <p className="mt-1 text-sm text-muted">
                    Fix anything that&apos;s off, then create it. Nothing is sent until you send it.
                </p>
            </div>

            <ErrorSummary errors={submittedErrors ?? undefined} labels={ERROR_LABELS} />

            <MatchField
                name="propertyId"
                error={fieldError("propertyId")}
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
                        <span className="block text-[0.8125rem] font-normal text-warning">
                            No unit matches &ldquo;{draft.unitText}.&rdquo; Choose one, or leave it empty.
                        </span>
                    )}
                    <select value={selectedUnitId} onChange={(e) => setUnitId(e.target.value)} className={inputClass}>
                        <option value="">No unit (whole property)</option>
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
                extraOption={{ value: IN_HOUSE, label: IN_HOUSE_OPTION_LABEL }}
                addHref="/contacts/new"
                onRefresh={refreshLists}
                refreshing={refreshing}
            />

            <Field label="Title" required error={fieldError("title")}>
                {(props) => (
                    <input
                        {...props}
                        name="title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className={inputClass}
                    />
                )}
            </Field>

            <label className={labelClass}>
                Due date
                {draft.dueDateText && (
                    <span className="block text-[0.8125rem] font-normal text-warning">
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

            <fieldset className="flex min-w-0 flex-col gap-3">
                <legend className={labelClass}>The work</legend>
                <p className="-mt-1 text-[0.8125rem] text-muted">
                    Fix any wording or priority here, or remove what doesn&apos;t belong. Photos are added after.
                </p>
                {fieldError("areas") && (
                    <p className="-mt-1 text-sm text-danger">{fieldError("areas")?.[0]}</p>
                )}
                <div className="divide-y divide-line rounded-lg border border-line">
                    {areas.map((area, areaIndex) => (
                        <div key={areaIndex} className="px-3 py-3 sm:px-4">
                            <div className="flex items-center gap-2">
                                <input
                                    value={area.name}
                                    onChange={(e) =>
                                        updateArea(areaIndex, (current) => ({ ...current, name: e.target.value }))
                                    }
                                    aria-label={`Area ${areaIndex + 1} name`}
                                    // The error summary's "The work" link jumps to the first empty field.
                                    name={
                                        firstEmpty?.areaIndex === areaIndex && firstEmpty.itemIndex === null
                                            ? "areas"
                                            : undefined
                                    }
                                    aria-invalid={!!fieldError("areas") && !area.name.trim()}
                                    maxLength={100}
                                    className={`${inputClass} h-9 py-1 font-semibold`}
                                />
                                <button
                                    type="button"
                                    onClick={() => setAreas((current) => current.filter((_, i) => i !== areaIndex))}
                                    disabled={areas.length === 1}
                                    aria-label={`Remove area ${area.name || areaIndex + 1}`}
                                    title="Remove area"
                                    className={iconButtonClass({ size: "sm", className: "hover:text-danger" })}
                                >
                                    <TrashIcon size={15} />
                                </button>
                            </div>
                            <ul className="mt-2 flex flex-col gap-2">
                                {area.lineItems.map((item, itemIndex) => (
                                    <li key={itemIndex} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                                        <input
                                            value={item.description}
                                            onChange={(e) =>
                                                updateItem(areaIndex, itemIndex, { description: e.target.value })
                                            }
                                            aria-label={`Item ${itemIndex + 1} in ${area.name || "this area"}`}
                                            name={
                                                firstEmpty?.areaIndex === areaIndex &&
                                                firstEmpty.itemIndex === itemIndex
                                                    ? "areas"
                                                    : undefined
                                            }
                                            aria-invalid={!!fieldError("areas") && !item.description.trim()}
                                            maxLength={1000}
                                            className={`${inputClass} min-w-0 flex-1 basis-full sm:basis-auto`}
                                        />
                                        <select
                                            value={item.priority}
                                            onChange={(e) =>
                                                updateItem(areaIndex, itemIndex, {
                                                    priority: e.target.value as LineItemPriority,
                                                })
                                            }
                                            aria-label={`Priority for item ${itemIndex + 1}`}
                                            className={`${inputClass} w-auto`}
                                        >
                                            {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                                                <option key={value} value={value}>
                                                    {label}
                                                </option>
                                            ))}
                                        </select>
                                        <button
                                            type="button"
                                            onClick={() => removeItem(areaIndex, itemIndex)}
                                            disabled={areas.length === 1 && area.lineItems.length === 1}
                                            aria-label={`Remove item ${itemIndex + 1} in ${area.name || "this area"}`}
                                            title="Remove item"
                                            className={iconButtonClass({ size: "sm", className: "hover:text-danger" })}
                                        >
                                            <XIcon size={15} />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            </fieldset>

            {error && (
                <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                    {error}
                </p>
            )}
            <div className="flex flex-col items-stretch gap-2 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
                <Button
                    variant="primary"
                    onClick={tryCreate}
                    pending={pending}
                    pendingLabel="Creating draft…"
                    className="sm:ml-auto"
                >
                    Create draft
                </Button>
            </div>
        </section>
    );
}

// A property or contractor as a searchable dropdown option, starred when it's a favorite.
function toComboOption<T extends { id: string; favorite?: boolean }>(
    option: T,
    optionLabel: (option: T) => string,
    group: string | undefined,
): ComboOption {
    return { value: option.id, label: optionLabel(option), starred: option.favorite, group };
}

type MatchFieldProps<T extends { id: string; favorite?: boolean }> = {
    // The form name the error summary uses to find the dropdown, and the field's error.
    name?: string;
    error?: string[];
    label: string;
    match: MatchResult<T>;
    spokenText: string | null;
    noun: string;
    options: T[];
    optionLabel: (option: T) => string;
    value: string;
    onChange: (id: string) => void;
    emptyOption?: string;
    // A choice that isn't a record, listed after the empty option (the contractor field's "In-house").
    extraOption?: { value: string; label: string };
    addHref: string;
    onRefresh: () => void;
    refreshing: boolean;
};

// Shows a matched record with a "Change" link, or a dropdown with a note when nothing (or more than one) matched.
function MatchField<T extends { id: string; favorite?: boolean }>({
    name,
    error,
    label,
    match,
    spokenText,
    noun,
    options,
    optionLabel,
    value,
    onChange,
    emptyOption,
    extraOption,
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
                        className="text-[0.8125rem] text-muted underline hover:text-foreground hover:cursor-pointer"
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
            <Field
                label={label}
                error={error}
                hint={note ? <span className="text-warning">{note}</span> : undefined}
            >
                {(props) => (
                    <Combobox
                        controlProps={props}
                        name={name}
                        value={value}
                        onChange={onChange}
                        placeholder={emptyOption ?? `Choose a ${noun}`}
                        searchPlaceholder={`Search ${noun === "property" ? "properties" : "contractors"}`}
                        options={[
                            ...(emptyOption ? [{ value: "", label: emptyOption }] : []),
                            ...(extraOption ? [{ value: extraOption.value, label: extraOption.label }] : []),
                            ...candidates.map((option) => toComboOption(option, optionLabel, "Best matches")),
                            ...starredFirst(
                                (candidates.length > 0 ? others : options).map((option) =>
                                    toComboOption(
                                        option,
                                        optionLabel,
                                        candidates.length > 0
                                            ? `All ${noun === "property" ? "properties" : "contractors"}`
                                            : undefined,
                                    ),
                                ),
                            ),
                        ]}
                    />
                )}
            </Field>
            {/* A new tab, so this page and the review stay as they are. */}
            <p className="mt-1 flex gap-4 text-[0.8125rem]">
                <a href={addHref} target="_blank" rel="noopener" className="text-muted underline hover:text-foreground">
                    Add a new {noun} ↗
                </a>
                <button
                    type="button"
                    onClick={onRefresh}
                    disabled={refreshing}
                    className="text-muted underline hover:text-foreground hover:cursor-pointer disabled:no-underline"
                >
                    {refreshing ? "Refreshing..." : "Refresh list"}
                </button>
            </p>
        </div>
    );
}
