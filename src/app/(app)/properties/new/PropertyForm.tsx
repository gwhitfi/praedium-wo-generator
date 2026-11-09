"use client";
import { useActionState, useId, useState } from "react";
import { createProperty } from "../actions";
import { MAX_UNIT_NAME_LENGTH, type PropertyFormState } from "../schemas";
import { inputClass, MULTI_UNIT, PROPERTY_TYPE_LABELS, US_STATE_LABELS } from "@/lib/defaults";
import { cardClass } from "@/lib/ui";
import { Button } from "@/components/Button";
import { PlusIcon, XIcon } from "@/components/Icons";
import { ErrorSummary, Field, FieldGroup, FormActions } from "@/components/form/Field";

export type PropertyFormValues = {
    displayName: string;
    propertyType: string;
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    zipCode: string;
    notes: string;
};

const FIELD_LABELS: Record<string, string> = {
    displayName: "Name",
    propertyType: "Type",
    addressLine1: "Street address",
    addressLine2: "Address line 2",
    city: "City",
    state: "State",
    zipCode: "Zip code",
    notes: "Notes",
    units: "Units",
};

export default function PropertyForm({
    initial,
    action = createProperty,
    submitLabel = "Add property",
    cancelHref,
    returnTo,
}: {
    initial?: PropertyFormValues;
    action?: (state: PropertyFormState, formData: FormData) => Promise<PropertyFormState>;
    submitLabel?: string;
    cancelHref: string;
    returnTo?: string;
}): React.ReactElement {
    const [state, formAction, pending] = useActionState(action, {});
    // React resets the form after each submit, so refill it with what was sent.
    const value = (name: keyof PropertyFormValues) => state.values?.[name] ?? initial?.[name];
    const editing = !!initial;
    type Unit = { name: string };
    const unitInputId = useId();

    const [propertyType, setPropertyType] = useState(initial?.propertyType ?? "HOUSE");
    const [units, setUnits] = useState<Unit[]>([]);
    const [unitDraft, setUnitDraft] = useState("");
    const [unitError, setUnitError] = useState<string | null>(null);
    const showUnits = MULTI_UNIT.includes(propertyType);

    function addUnit() {
        const name = unitDraft.trim();
        if (!name) return;
        if (units.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
            setUnitError(`"${name}" has already been added.`);
            return;
        }
        setUnits([...units, { name }]);
        setUnitDraft("");
        setUnitError(null);
    }

    function removeUnit(index: number) {
        setUnits(units.filter((_, i) => i !== index));
    }

    return (
        <form action={formAction} noValidate className="flex flex-col gap-6">
            <ErrorSummary errors={state.errors} labels={FIELD_LABELS} message={state.error} />

            <div className={`${cardClass} flex flex-col gap-6 p-5 sm:p-6`}>
                <FieldGroup title="The property">
                    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
                        <Field
                            label="Name"
                            required
                            error={state.errors?.displayName}
                            hint="What your team calls it, like “Pelham Court” or the street address."
                        >
                            {(props) => (
                                <input
                                    {...props}
                                    name="displayName"
                                    required
                                    maxLength={100}
                                    autoComplete="off"
                                    defaultValue={value("displayName")}
                                    className={inputClass}
                                />
                            )}
                        </Field>
                        <Field label="Type" required error={state.errors?.propertyType}>
                            {(props) => (
                                <select
                                    {...props}
                                    name="propertyType"
                                    required
                                    className={inputClass}
                                    value={propertyType}
                                    onChange={(e) => setPropertyType(e.target.value)}
                                >
                                    {Object.entries(PROPERTY_TYPE_LABELS).map(([type, label]) => (
                                        <option key={type} value={type}>
                                            {label}
                                        </option>
                                    ))}
                                </select>
                            )}
                        </Field>
                    </div>
                </FieldGroup>

                <FieldGroup title="Address">
                    <Field label="Street address" required error={state.errors?.addressLine1}>
                        {(props) => (
                            <input
                                {...props}
                                name="addressLine1"
                                required
                                maxLength={200}
                                autoComplete="off"
                                defaultValue={value("addressLine1")}
                                className={inputClass}
                            />
                        )}
                    </Field>
                    <Field label="Address line 2" optional error={state.errors?.addressLine2}>
                        {(props) => (
                            <input
                                {...props}
                                name="addressLine2"
                                maxLength={200}
                                autoComplete="off"
                                defaultValue={value("addressLine2")}
                                className={inputClass}
                            />
                        )}
                    </Field>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-6">
                        <Field label="City" required error={state.errors?.city} className="col-span-2 sm:col-span-3">
                            {(props) => (
                                <input
                                    {...props}
                                    name="city"
                                    required
                                    maxLength={100}
                                    autoComplete="off"
                                    defaultValue={value("city")}
                                    className={inputClass}
                                />
                            )}
                        </Field>
                        <Field label="State" required error={state.errors?.state} className="sm:col-span-1">
                            {(props) => (
                                <select
                                    {...props}
                                    name="state"
                                    required
                                    defaultValue={value("state")}
                                    className={inputClass}
                                >
                                    <option value="">—</option>
                                    {Object.entries(US_STATE_LABELS).map(([code, name]) => (
                                        <option key={code} value={code} title={name}>
                                            {code}
                                        </option>
                                    ))}
                                </select>
                            )}
                        </Field>
                        <Field label="Zip code" required error={state.errors?.zipCode} className="sm:col-span-2">
                            {(props) => (
                                <input
                                    {...props}
                                    name="zipCode"
                                    required
                                    inputMode="numeric"
                                    autoComplete="off"
                                    defaultValue={value("zipCode")}
                                    className={inputClass}
                                />
                            )}
                        </Field>
                    </div>
                </FieldGroup>

                {showUnits && !editing && (
                    <FieldGroup
                        title="Units"
                        description="Add each apartment or suite now, or later from the property page."
                    >
                        <div>
                            <label htmlFor={unitInputId} className="mb-1 block text-sm font-medium text-secondary">
                                Unit name
                            </label>
                            <div className="flex flex-col gap-2 sm:flex-row">
                                <input
                                    id={unitInputId}
                                    value={unitDraft}
                                    onChange={(e) => {
                                        setUnitDraft(e.target.value);
                                        setUnitError(null);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            e.preventDefault();
                                            addUnit();
                                        }
                                    }}
                                    placeholder="Unit A, Apt 101…"
                                    maxLength={MAX_UNIT_NAME_LENGTH}
                                    aria-invalid={unitError || state.errors?.units ? true : undefined}
                                    className={inputClass}
                                />
                                <Button onClick={addUnit} disabled={!unitDraft.trim()}>
                                    <PlusIcon />
                                    Add unit
                                </Button>
                            </div>
                            {(unitError || state.errors?.units) && (
                                <p role="alert" className="mt-1 text-sm text-danger">
                                    {unitError ?? state.errors?.units?.[0]}
                                </p>
                            )}
                        </div>
                        {units.length > 0 ? (
                            <ul className="flex flex-wrap gap-2" aria-label="Units to add">
                                {units.map((unit, i) => (
                                    <li
                                        key={unit.name}
                                        className="flex items-center gap-1 rounded-full border border-line-strong bg-surface py-1 pr-1 pl-3 text-sm"
                                    >
                                        {unit.name}
                                        <button
                                            type="button"
                                            onClick={() => removeUnit(i)}
                                            className="flex h-6 w-6 items-center justify-center rounded-full text-subtle hover:cursor-pointer hover:bg-surface-hover hover:text-danger"
                                            aria-label={`Remove ${unit.name}`}
                                        >
                                            <XIcon size={12} />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-sm text-subtle">No units added yet.</p>
                        )}
                        <input type="hidden" name="units" value={JSON.stringify(units)} />
                    </FieldGroup>
                )}

                <FieldGroup title="Anything else">
                    <Field
                        label="Notes"
                        optional
                        error={state.errors?.notes}
                        hint="Gate codes, shutoff locations, quirks. Only your team sees these."
                    >
                        {(props) => (
                            <textarea
                                {...props}
                                name="notes"
                                rows={3}
                                maxLength={5000}
                                defaultValue={value("notes")}
                                className={inputClass}
                            />
                        )}
                    </Field>
                </FieldGroup>
            </div>

            {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
            <FormActions cancelHref={cancelHref} submitLabel={submitLabel} pending={pending} />
        </form>
    );
}
