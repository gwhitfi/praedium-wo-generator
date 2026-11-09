"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { decodeFormDraft, encodeFormDraft } from "@/lib/formDraft";
import RestoredNotice from "@/components/form/RestoredNotice";
import { createContact } from "../actions";
import { suggestedDisplayName, type ContactFormState } from "../schemas";
import { CONTACT_TYPE_LABELS, inputClass, US_STATE_LABELS } from "@/lib/defaults";
import { cardClass } from "@/lib/ui";
import { ErrorSummary, Field, FieldGroup, FormActions } from "@/components/form/Field";
import Combobox from "@/components/form/Combobox";
import { starredFirst } from "@/lib/options";

type UnitOption = { id: string; name: string };
type PropertyOption = {
    id: string;
    displayName: string;
    addressLine1?: string;
    favorite?: boolean;
    units: UnitOption[];
};

export type ContactFormValues = {
    contactType: string;
    displayName: string;
    firstName: string;
    lastName: string;
    company: string;
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    zipCode: string;
    phone: string;
    email: string;
    notes: string;
    propertyId: string;
    unitId: string;
    inHouse: boolean;
};

const FIELD_LABELS: Record<string, string> = {
    contactType: "Type",
    displayName: "Display name",
    firstName: "First name",
    lastName: "Last name",
    company: "Company",
    phone: "Phone",
    email: "Email",
    propertyId: "Property",
    unitId: "Unit",
    addressLine1: "Address",
    addressLine2: "Address line 2",
    city: "City",
    state: "State",
    zipCode: "Zip code",
    notes: "Notes",
};

const ADDRESS_FIELDS = ["addressLine1", "addressLine2", "city", "state", "zipCode"] as const;

// What's typed on a new contact, kept in this browser as the user goes (src/lib/formDraft.ts), so a refresh or a
// closed tab doesn't lose it. Cleared on submit. Worth restoring only with one of DRAFT_MEANINGFUL filled in.
const DRAFT_KEY = "praedium-new-contact";
const DRAFT_MEANINGFUL = ["firstName", "lastName", "company", "email", "phone", "notes"];
// The fields the form doesn't keep in state, put back straight into the inputs.
const UNCONTROLLED_FIELDS = ["phone", "email", "notes", ...ADDRESS_FIELDS];

function saveDraft(form: HTMLFormElement) {
    const values: Record<string, string> = {};
    for (const [name, entry] of new FormData(form).entries()) {
        if (typeof entry === "string") values[name] = entry;
    }
    try {
        localStorage.setItem(DRAFT_KEY, encodeFormDraft(values));
    } catch {
        // Storage can be blocked (private browsing); the form still works for this visit.
    }
}

function clearDraft() {
    try {
        localStorage.removeItem(DRAFT_KEY);
    } catch {
        // See saveDraft.
    }
}

const TYPE_HINTS: Record<string, string> = {
    CONTRACTOR: "Someone you send work orders to",
    TENANT: "Lives at one of your properties",
    OTHER: "Anyone else, like an owner or vendor",
};

export default function ContactForm({
    properties,
    initial,
    action = createContact,
    submitLabel = "Add contact",
    cancelHref,
    lockType = false,
    returnTo,
}: {
    properties: PropertyOption[];
    initial?: ContactFormValues;
    action?: (state: ContactFormState, formData: FormData) => Promise<ContactFormState>;
    submitLabel?: string;
    cancelHref: string;
    lockType?: boolean;
    // Where to go after saving a new contact, such as back to a new work order.
    returnTo?: string;
}): React.ReactElement {
    const [state, formAction, pending] = useActionState(action, {});
    // React resets the form after each submit, so refill it with what was sent.
    const value = (name: Exclude<keyof ContactFormValues, "inHouse">) => state.values?.[name] ?? initial?.[name];
    const inHouseChecked = state.values ? state.values.inHouse === "on" : (initial?.inHouse ?? false);
    const editing = !!initial;
    const [contactType, setContactType] = useState(initial?.contactType ?? "CONTRACTOR");
    const [selectedProperty, setSelectedProperty] = useState(initial?.propertyId ?? "");
    const [selectedUnit, setSelectedUnit] = useState(initial?.unitId ?? "");
    const units = properties.find((p) => p.id === selectedProperty)?.units ?? [];
    const isTenant = contactType === "TENANT";

    // The display name is an optional override; left blank, it's the name or company, shown as its placeholder.
    const [first, setFirst] = useState(initial?.firstName ?? "");
    const [last, setLast] = useState(initial?.lastName ?? "");
    const [company, setCompany] = useState(initial?.company ?? "");
    // A saved display name that's just the name (or company) starts blank, so it keeps following the name fields.
    const [displayName, setDisplayName] = useState(() =>
        initial &&
        initial.displayName ===
            suggestedDisplayName(
                initial.firstName,
                initial.lastName,
                initial.contactType === "TENANT" ? "" : initial.company,
            )
            ? ""
            : (initial?.displayName ?? ""),
    );
    const suggestion = suggestedDisplayName(first, last, isTenant ? "" : company);
    const [displayNameOpened, setShowDisplayName] = useState(false);
    const showDisplayName =
        displayNameOpened || !!state.errors?.displayName || (!!displayName.trim() && displayName.trim() !== suggestion);

    // A new contact's draft from an earlier visit: put back once, with a notice offering to start fresh. Saving waits
    // until the restore has run, so it can't overwrite the draft before it's read.
    const formRef = useRef<HTMLFormElement>(null);
    const [restoredAt, setRestoredAt] = useState<Date | null>(null);
    const restoreDone = useRef(false);

    useEffect(() => {
        if (editing) return;
        let draft: ReturnType<typeof decodeFormDraft> = null;
        try {
            draft = decodeFormDraft(localStorage.getItem(DRAFT_KEY), DRAFT_MEANINGFUL);
        } catch {
            draft = null;
        }
        restoreDone.current = true;
        const form = formRef.current;
        if (!draft || !form) return;
        const saved = draft.values;
        for (const name of UNCONTROLLED_FIELDS) {
            const field = form.elements.namedItem(name);
            if (
                field instanceof HTMLInputElement ||
                field instanceof HTMLTextAreaElement ||
                field instanceof HTMLSelectElement
            ) {
                field.value = saved[name] ?? "";
            }
        }
        const inHouseBox = form.elements.namedItem("inHouse");
        if (inHouseBox instanceof HTMLInputElement) inHouseBox.checked = saved.inHouse === "on";
        /* eslint-disable react-hooks/set-state-in-effect -- a one-time restore from browser storage, which the
           server render can't see, so it can't be the initial state */
        if (!lockType && saved.contactType) setContactType(saved.contactType);
        setFirst(saved.firstName ?? "");
        setLast(saved.lastName ?? "");
        setCompany(saved.company ?? "");
        setDisplayName(saved.displayName ?? "");
        setSelectedProperty(saved.propertyId ?? "");
        setSelectedUnit(saved.unitId ?? "");
        setRestoredAt(draft.savedAt);
        /* eslint-enable react-hooks/set-state-in-effect */
    }, [editing, lockType]);

    // Typing saves through the form's onChange; the state-held choices are saved here once they've rendered.
    useEffect(() => {
        if (!editing && restoreDone.current && formRef.current) saveDraft(formRef.current);
    }, [editing, contactType, first, last, company, displayName, selectedProperty, selectedUnit, state]);

    function startFresh() {
        clearDraft();
        formRef.current?.reset();
        setContactType("CONTRACTOR");
        setFirst("");
        setLast("");
        setCompany("");
        setDisplayName("");
        setSelectedProperty("");
        setSelectedUnit("");
        setRestoredAt(null);
    }

    // After a failed save, show what was sent. React resets the form after each submit, which sets the type radios
    // back to how they first rendered without React noticing; their key redraws them from state after every response.
    const [shownState, setShownState] = useState(state);
    const [responseCount, setResponseCount] = useState(0);
    if (state !== shownState) {
        setShownState(state);
        setResponseCount((n) => n + 1);
        if (state.values) {
            setFirst(state.values.firstName ?? "");
            setLast(state.values.lastName ?? "");
            setCompany(state.values.company ?? "");
            setDisplayName(state.values.displayName ?? "");
            if (state.values.contactType) setContactType(state.values.contactType);
            if (state.values.propertyId !== undefined) setSelectedProperty(state.values.propertyId);
            setSelectedUnit(state.values.unitId ?? "");
        }
    }

    return (
        <form
            ref={formRef}
            action={formAction}
            noValidate
            onChange={(e) => {
                if (!editing && restoreDone.current) saveDraft(e.currentTarget);
            }}
            onSubmit={() => {
                if (!editing) clearDraft();
            }}
            className="flex flex-col gap-6"
        >
            {restoredAt && <RestoredNotice what="the contact" savedAt={restoredAt} onStartFresh={startFresh} />}
            <ErrorSummary errors={state.errors} labels={FIELD_LABELS} message={state.error} />

            <div className={`${cardClass} flex flex-col gap-6 p-5 sm:p-6`}>
                <fieldset>
                    <legend className="mb-2 text-sm font-medium text-secondary">
                        Type
                    </legend>
                    <div className="grid gap-2 sm:grid-cols-3">
                        {Object.entries(CONTACT_TYPE_LABELS).map(([type, label]) => (
                            <label
                                key={type}
                                className={`flex cursor-pointer flex-col rounded-lg border px-3 py-2.5 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${
                                    contactType === type
                                        ? "border-accent bg-accent/10"
                                        : "border-line-strong hover:border-line-hover"
                                } ${lockType && contactType !== type ? "cursor-not-allowed opacity-50" : ""}`}
                            >
                                <span className="flex items-center gap-2 font-medium text-foreground">
                                    <input
                                        key={responseCount}
                                        type="radio"
                                        name={lockType ? undefined : "contactType"}
                                        value={type}
                                        checked={contactType === type}
                                        disabled={lockType && contactType !== type}
                                        onChange={() => setContactType(type)}
                                        className="h-4 w-4 accent-accent"
                                    />
                                    {label}
                                </span>
                                <span className="mt-0.5 pl-6 text-[0.8125rem] text-muted">{TYPE_HINTS[type]}</span>
                            </label>
                        ))}
                    </div>
                    {lockType && (
                        <>
                            <input type="hidden" name="contactType" value={contactType} />
                            <p className="mt-2 text-[0.8125rem] text-muted">
                                The type can&apos;t change because this contact is on work orders.
                            </p>
                        </>
                    )}
                    {state.errors?.contactType && (
                        <p className="mt-1 text-sm text-danger">{state.errors.contactType[0]}</p>
                    )}
                </fieldset>

                <FieldGroup
                    title="Name"
                    description={isTenant ? "Their first name, last name or both." : "A person's name, a company, or both."}
                >
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="First name" error={state.errors?.firstName}>
                            {(props) => (
                                <input
                                    {...props}
                                    name="firstName"
                                    maxLength={50}
                                    autoComplete="off"
                                    value={first}
                                    onChange={(e) => setFirst(e.target.value)}
                                    className={inputClass}
                                />
                            )}
                        </Field>
                        <Field label="Last name" error={state.errors?.lastName}>
                            {(props) => (
                                <input
                                    {...props}
                                    name="lastName"
                                    maxLength={50}
                                    autoComplete="off"
                                    value={last}
                                    onChange={(e) => setLast(e.target.value)}
                                    className={inputClass}
                                />
                            )}
                        </Field>
                    </div>
                    {!isTenant && (
                        <Field label="Company" optional error={state.errors?.company}>
                            {(props) => (
                                <input
                                    {...props}
                                    name="company"
                                    maxLength={100}
                                    autoComplete="off"
                                    value={company}
                                    onChange={(e) => setCompany(e.target.value)}
                                    className={inputClass}
                                />
                            )}
                        </Field>
                    )}
                    {/* The display name is an override most people never need, so it's behind a link unless it's
                        already set to something other than the name or has an error. */}
                    {showDisplayName ? (
                        <Field
                            label="Display name"
                            optional
                            error={state.errors?.displayName}
                            hint="How they appear in lists and on work orders. Leave it blank to use the name above."
                        >
                            {(props) => (
                                <input
                                    {...props}
                                    name="displayName"
                                    maxLength={100}
                                    autoComplete="off"
                                    value={displayName}
                                    placeholder={suggestion}
                                    onChange={(e) => setDisplayName(e.target.value)}
                                    className={inputClass}
                                />
                            )}
                        </Field>
                    ) : (
                        suggestion && (
                        <p className="-mt-1 text-[0.8125rem] text-muted">
                            Shown as <span className="font-medium text-secondary">{suggestion}</span>.{" "}
                            <button
                                type="button"
                                onClick={() => setShowDisplayName(true)}
                                className="inline-flex min-h-8 items-center font-medium text-accent hover:cursor-pointer hover:underline"
                            >
                                Use a different name
                            </button>
                        </p>
                        )
                    )}
                    {!isTenant && (
                        <label className="flex items-start gap-3 text-sm hover:cursor-pointer">
                            <input
                                type="checkbox"
                                name="inHouse"
                                defaultChecked={inHouseChecked}
                                className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
                            />
                            <span>
                                <span className="block font-medium text-foreground">They work for us (in-house)</span>
                                <span className="block text-[0.8125rem] text-muted">
                                    Listed first when assigning work orders. They still get the work order link by
                                    email.
                                </span>
                            </span>
                        </label>
                    )}
                </FieldGroup>

                <FieldGroup title="How to reach them">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Phone" optional error={state.errors?.phone}>
                            {(props) => (
                                <input
                                    {...props}
                                    type="tel"
                                    name="phone"
                                    autoComplete="off"
                                    inputMode="tel"
                                    defaultValue={value("phone")}
                                    className={inputClass}
                                />
                            )}
                        </Field>
                        <Field
                            label="Email"
                            required
                            error={state.errors?.email}
                            hint={isTenant ? undefined : "Work orders are sent here."}
                        >
                            {(props) => (
                                <input
                                    {...props}
                                    type="email"
                                    name="email"
                                    required
                                    autoComplete="off"
                                    defaultValue={value("email")}
                                    className={inputClass}
                                />
                            )}
                        </Field>
                    </div>
                </FieldGroup>

                {isTenant ? (
                    <FieldGroup title="Where they live">
                        <div className={`grid gap-4 ${units.length > 1 ? "sm:grid-cols-2" : ""}`}>
                            <Field label="Property" required={!editing} error={state.errors?.propertyId}>
                                {(props) => (
                                    <Combobox
                                        controlProps={props}
                                        name="propertyId"
                                        value={selectedProperty}
                                        onChange={(id) => {
                                            setSelectedProperty(id);
                                            setSelectedUnit(id === initial?.propertyId ? initial.unitId : "");
                                        }}
                                        options={[
                                            ...(editing ? [{ value: "", label: "No property" }] : []),
                                            ...starredFirst(
                                                properties.map((property) => ({
                                                    value: property.id,
                                                    label: property.displayName,
                                                    description:
                                                        property.addressLine1 &&
                                                        property.addressLine1 !== property.displayName
                                                            ? property.addressLine1
                                                            : undefined,
                                                    starred: property.favorite,
                                                    keywords: property.units.map((unit) => unit.name),
                                                })),
                                            ),
                                        ]}
                                        placeholder="Choose a property"
                                        searchPlaceholder="Search properties"
                                    />
                                )}
                            </Field>

                            {units.length > 1 && (
                                <Field label="Unit" required error={state.errors?.unitId}>
                                    {(props) => (
                                        <Combobox
                                            controlProps={props}
                                            name="unitId"
                                            value={selectedUnit}
                                            onChange={setSelectedUnit}
                                            options={units.map((unit) => ({ value: unit.id, label: unit.name }))}
                                            placeholder="Choose a unit"
                                            searchPlaceholder="Search units"
                                        />
                                    )}
                                </Field>
                            )}
                        </div>
                        {units.length === 1 && <input type="hidden" name="unitId" value={units[0].id} />}
                    </FieldGroup>
                ) : (
                    <FieldGroup
                        title="Mailing address"
                        description="Handy for invoices and records."
                        collapsible
                        defaultOpen={ADDRESS_FIELDS.some((name) => !!value(name) || !!state.errors?.[name])}
                    >
                        <Field label="Street address" error={state.errors?.addressLine1}>
                            {(props) => (
                                <input
                                    {...props}
                                    name="addressLine1"
                                    autoComplete="off"
                                    defaultValue={value("addressLine1")}
                                    className={inputClass}
                                />
                            )}
                        </Field>
                        <Field label="Apartment, suite, etc." error={state.errors?.addressLine2}>
                            {(props) => (
                                <input
                                    {...props}
                                    name="addressLine2"
                                    autoComplete="off"
                                    defaultValue={value("addressLine2")}
                                    className={inputClass}
                                />
                            )}
                        </Field>
                        <div className="grid grid-cols-2 gap-4 sm:grid-cols-6">
                            <Field label="City" error={state.errors?.city} className="col-span-2 sm:col-span-3">
                                {(props) => (
                                    <input
                                        {...props}
                                        name="city"
                                        autoComplete="off"
                                        defaultValue={value("city")}
                                        className={inputClass}
                                    />
                                )}
                            </Field>
                            <Field label="State" error={state.errors?.state} className="sm:col-span-1">
                                {(props) => (
                                    <select {...props} name="state" defaultValue={value("state")} className={inputClass}>
                                        <option value="">—</option>
                                        {Object.entries(US_STATE_LABELS).map(([code, name]) => (
                                            <option key={code} value={code} title={name}>
                                                {code}
                                            </option>
                                        ))}
                                    </select>
                                )}
                            </Field>
                            <Field label="Zip code" error={state.errors?.zipCode} className="sm:col-span-2">
                                {(props) => (
                                    <input
                                        {...props}
                                        name="zipCode"
                                        inputMode="numeric"
                                        autoComplete="off"
                                        defaultValue={value("zipCode")}
                                        className={inputClass}
                                    />
                                )}
                            </Field>
                        </div>
                    </FieldGroup>
                )}

                <FieldGroup title="Anything else">
                    <Field label="Notes" optional error={state.errors?.notes} hint="Only your team sees these.">
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
