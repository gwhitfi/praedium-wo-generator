"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createWorkOrder } from "../actions";
import {
    DEFAULT_AREA_NAME,
    MAX_AREA_NAME_LENGTH,
    MAX_ITEM_LENGTH,
    MAX_NOTES_LENGTH,
    MAX_TITLE_LENGTH,
    type WorkOrderFormState,
} from "../schemas";
import { assignableContactLabel, IN_HOUSE, IN_HOUSE_OPTION_LABEL, inputClass, PRIORITY_LABELS } from "@/lib/defaults";
import { cardClass } from "@/lib/ui";
import { ErrorSummary, Field, FieldGroup, FormActions } from "@/components/form/Field";
import Combobox from "@/components/form/Combobox";
import { starredFirst, type ComboOption } from "@/lib/options";
import { decodeFormDraft, encodeFormDraft } from "@/lib/formDraft";
import RestoredNotice from "@/components/form/RestoredNotice";

type UnitOption = { id: string; name: string };
type PropertyOption = {
    id: string;
    displayName: string;
    addressLine1?: string;
    city?: string;
    favorite?: boolean;
    units: UnitOption[];
};
type ContactOption = {
    id: string;
    displayName: string;
    company: string | null;
    inHouse: boolean;
    favorite?: boolean;
    phone?: string | null;
    email?: string | null;
};
type TenantOption = {
    id: string;
    displayName: string;
    email: string | null;
    unitId: string | null;
};
export type WorkOrderFormValues = {
    title: string;
    propertyId: string;
    unitId: string;
    // A contact's id, IN_HOUSE, or "" for "Assign later".
    contractorId: string;
    notes: string;
    dueDate: string; // YYYY-MM-DD
    notifyTenant: boolean;
};

// What's typed on a new work order, kept in this browser as the user goes (src/lib/formDraft.ts), so a refresh, a
// closed tab or a trip to add a property or contractor doesn't lose it. Cleared on submit.
const DRAFT_KEY = "praedium-new-work-order";
// A draft is only worth restoring with one of these filled in.
const DRAFT_MEANINGFUL = ["title", "notes"];

function formValues(form: HTMLFormElement): Record<string, string> {
    const values: Record<string, string> = {};
    for (const [name, entry] of new FormData(form).entries()) {
        if (typeof entry === "string") values[name] = entry;
    }
    return values;
}

function saveDraft(form: HTMLFormElement, quiet = false) {
    try {
        localStorage.setItem(DRAFT_KEY, encodeFormDraft(formValues(form), quiet));
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

const FIELD_LABELS: Record<string, string> = {
    title: "Title",
    propertyId: "Property",
    unitId: "Unit",
    contractorId: "Contractor",
    dueDate: "Due date",
    notes: "Notes",
    firstItem: "First item",
    firstArea: "Area",
};

// The contractor choices: "Assign later" and "In-house" first, then your own staff, starred contractors and the
// rest, each under a heading.
function contractorOptions(contractors: ContactOption[]): ComboOption[] {
    const option = (c: ContactOption, group: string): ComboOption => ({
        value: c.id,
        label: assignableContactLabel(c),
        description: c.company && c.company !== c.displayName ? c.company : undefined,
        starred: c.favorite,
        group,
        keywords: [c.company, c.email, c.phone],
    });
    return [
        { value: "", label: "Assign later", description: "Keep it as a draft for now" },
        { value: IN_HOUSE, label: IN_HOUSE_OPTION_LABEL, description: "No contractor; your team checks it off" },
        ...contractors.filter((c) => c.inHouse).map((c) => option(c, "Your staff")),
        ...contractors.filter((c) => !c.inHouse && c.favorite).map((c) => option(c, "Starred")),
        ...contractors.filter((c) => !c.inHouse && !c.favorite).map((c) => option(c, "Contractors")),
    ];
}

// "2026-11-15" for `days` from today, in the browser's own calendar.
function daysFromToday(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() + days);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const QUICK_DUE_DATES = [
    { label: "In 3 days", days: 3 },
    { label: "In 1 week", days: 7 },
    { label: "In 2 weeks", days: 14 },
];

export default function WorkOrderForm({
    properties,
    contractors,
    tenants,
    defaultPropertyId,
    defaultContractorId,
    initial,
    action = createWorkOrder,
    submitLabel = "Continue to the work",
    cancelHref,
    lockProperty = false,
    sent = false,
}: {
    properties: PropertyOption[];
    contractors: ContactOption[];
    tenants: TenantOption[];
    defaultPropertyId?: string;
    defaultContractorId?: string;
    initial?: WorkOrderFormValues;
    action?: (state: WorkOrderFormState, formData: FormData) => Promise<WorkOrderFormState>;
    submitLabel?: string;
    cancelHref: string;
    lockProperty?: boolean;
    // The work order has already gone to the contractor, so the tenant email won't be sent.
    sent?: boolean;
}): React.ReactElement {
    const [state, formAction, pending] = useActionState(action, {});
    const formRef = useRef<HTMLFormElement>(null);
    const dueRef = useRef<HTMLInputElement>(null);
    const router = useRouter();
    // React resets the form after each submit, so refill it with what was sent.
    const value = (name: keyof WorkOrderFormValues) => state.values?.[name] ?? initial?.[name]?.toString();

    const [selectedProperty, setSelectedProperty] = useState(initial?.propertyId ?? defaultPropertyId ?? "");
    const [selectedContractor, setSelectedContractor] = useState(initial?.contractorId ?? defaultContractorId ?? "");
    const [selectedUnit, setSelectedUnit] = useState(initial?.unitId ?? "");
    const [contactTenant, setContactTenant] = useState(initial?.notifyTenant ?? false);
    const property = properties.find((p) => p.id === selectedProperty);
    const units = property?.units ?? [];
    const selectedUnitId = units.length === 1 ? units[0].id : selectedUnit;
    const tenant = tenants.find((t) => t.unitId === selectedUnitId);
    const tenantEmailable = !sent && !!selectedUnitId && !!tenant?.email?.trim();
    const creating = !initial;
    // When a draft from an earlier visit was put back: says so and offers to start fresh.
    const [restoredAt, setRestoredAt] = useState<Date | null>(null);
    // Drafts are saved only after the restore below has run, so it can't overwrite the draft before reading it.
    const restoreDone = useRef(false);
    const propertyOptions = starredFirst(
        properties.map((p) => ({
            value: p.id,
            label: p.displayName,
            description: p.addressLine1 && p.addressLine1 !== p.displayName ? `${p.addressLine1}, ${p.city}` : p.city,
            starred: p.favorite,
            keywords: p.units.map((unit) => unit.name),
        })),
    );

    // After a failed save, put the dropdowns and checkbox back the way they were sent.
    // React resets the form after each submit, which sets a controlled checkbox back to how it first rendered
    // without React noticing; the key below redraws it from state after every response.
    const [shownState, setShownState] = useState(state);
    const [responseCount, setResponseCount] = useState(0);
    if (state !== shownState) {
        setShownState(state);
        setResponseCount((n) => n + 1);
        if (state.values) {
            if (!lockProperty && state.values.propertyId !== undefined) setSelectedProperty(state.values.propertyId);
            setSelectedUnit(state.values.unitId ?? "");
            setSelectedContractor(state.values.contractorId ?? "");
            setContactTenant(state.values.tenant === "on");
        }
    }

    // Put back a draft from an earlier visit, or from before "Add a new property" or "Add a new contractor" (quietly,
    // without the notice). The property or contractor just added (from the URL) wins over the saved choice.
    useEffect(() => {
        if (!creating) return;
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
        for (const name of ["title", "notes", "dueDate", "firstArea", "firstItem", "firstPriority"]) {
            const field = form.elements.namedItem(name);
            if (
                field instanceof HTMLInputElement ||
                field instanceof HTMLTextAreaElement ||
                field instanceof HTMLSelectElement
            ) {
                if (saved[name] !== undefined) field.value = saved[name];
            }
        }
        /* eslint-disable react-hooks/set-state-in-effect -- a one-time restore from browser storage, which the
           server render can't see, so it can't be the initial state */
        if (!defaultPropertyId && saved.propertyId) {
            setSelectedProperty(saved.propertyId);
            setSelectedUnit(saved.unitId ?? "");
        }
        if (!defaultContractorId) setSelectedContractor(saved.contractorId ?? "");
        setContactTenant(saved.tenant === "on");
        if (!draft.quiet) setRestoredAt(draft.savedAt);
        /* eslint-enable react-hooks/set-state-in-effect */
    }, [creating, defaultPropertyId, defaultContractorId]);

    // Typing saves through the form's onChange; the dropdowns and the checkbox are state, saved here once they've
    // rendered into the form. A failed submit (a new `state`) saves again, since submitting cleared the draft.
    useEffect(() => {
        if (creating && restoreDone.current && formRef.current) saveDraft(formRef.current);
    }, [creating, selectedProperty, selectedUnit, selectedContractor, contactTenant, state]);

    function startFresh() {
        clearDraft();
        formRef.current?.reset();
        setSelectedProperty(defaultPropertyId ?? "");
        setSelectedUnit("");
        setSelectedContractor(defaultContractorId ?? "");
        setContactTenant(false);
        setRestoredAt(null);
    }

    // Saves what's been typed, then opens the page to add a property or contractor, which comes back here.
    function leaveToAdd(path: string) {
        if (formRef.current) saveDraft(formRef.current, true);
        router.push(`${path}?returnTo=/work-orders/new`);
    }
    const goAddProperty = () => leaveToAdd("/properties/new");
    const goAddContractor = () => leaveToAdd("/contacts/new");

    return (
        <form
            ref={formRef}
            action={formAction}
            noValidate
            onChange={(e) => {
                if (creating && restoreDone.current) saveDraft(e.currentTarget);
            }}
            onSubmit={() => {
                if (creating) clearDraft();
            }}
            className="flex flex-col gap-6"
        >
            {restoredAt && <RestoredNotice what="the work order" savedAt={restoredAt} onStartFresh={startFresh} />}
            <ErrorSummary errors={state.errors} labels={FIELD_LABELS} message={state.error} />

            <div className={`${cardClass} flex flex-col gap-6 p-5 sm:p-6`}>
                <FieldGroup title="What and where">
                    <Field label="Title" required error={state.errors?.title} hint="A short summary, like “Leak under kitchen sink”.">
                        {(props) => (
                            <input
                                {...props}
                                name="title"
                                required
                                maxLength={MAX_TITLE_LENGTH}
                                defaultValue={value("title")}
                                className={inputClass}
                            />
                        )}
                    </Field>

                    <div className={`grid gap-4 ${units.length > 1 ? "sm:grid-cols-2" : ""}`}>
                        {lockProperty ? (
                            <div>
                                <p className="mb-1 text-sm font-medium text-secondary">Property</p>
                                <p className="rounded-md border border-line bg-surface-hover/40 px-3 py-2 text-sm text-foreground">
                                    {property?.displayName}
                                </p>
                                <p className="mt-1 text-[0.8125rem] text-muted">
                                    To use a different property, create a new work order.
                                </p>
                            </div>
                        ) : (
                            <Field label="Property" required error={state.errors?.propertyId}>
                                {(props) => (
                                    <Combobox
                                        controlProps={props}
                                        name="propertyId"
                                        value={selectedProperty}
                                        onChange={(id) => {
                                            setSelectedProperty(id);
                                            setSelectedUnit("");
                                        }}
                                        options={propertyOptions}
                                        placeholder="Choose a property"
                                        searchPlaceholder="Search properties"
                                        emptyText="No properties match. Add a new one below."
                                        action={{ label: "Add a new property", onSelect: goAddProperty }}
                                    />
                                )}
                            </Field>
                        )}
                        {units.length > 1 && (
                            <Field label="Unit" error={state.errors?.unitId}>
                                {(props) => (
                                    <Combobox
                                        controlProps={props}
                                        name="unitId"
                                        value={selectedUnit}
                                        onChange={setSelectedUnit}
                                        options={[
                                            { value: "", label: "Whole property (no unit)" },
                                            ...units.map((unit) => ({ value: unit.id, label: unit.name })),
                                        ]}
                                        searchPlaceholder="Search units"
                                    />
                                )}
                            </Field>
                        )}
                    </div>
                    {units.length === 1 && <input type="hidden" name="unitId" value={units[0].id} />}
                </FieldGroup>

                {/* New work orders only: the first item can go in now, so a one-line job is written up in one step.
                    More areas and items are added on the next page. */}
                {creating && (
                    <FieldGroup
                        title="Add the first item now"
                        description="Handy for a one-line job. You can add more areas and items on the next page."
                        collapsible
                        defaultOpen={
                            !!state.values?.firstItem?.trim() ||
                            !!state.values?.firstArea?.trim() ||
                            !!state.errors?.firstItem ||
                            !!state.errors?.firstArea
                        }
                    >
                        <Field
                            label="What needs doing"
                            error={state.errors?.firstItem}
                            hint="Like “Replace the kitchen faucet cartridge”."
                        >
                            {(props) => (
                                <input
                                    {...props}
                                    name="firstItem"
                                    maxLength={MAX_ITEM_LENGTH}
                                    autoComplete="off"
                                    defaultValue={state.values?.firstItem}
                                    className={inputClass}
                                />
                            )}
                        </Field>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field
                                label="Area"
                                optional
                                error={state.errors?.firstArea}
                                hint={`Like Kitchen or Roof. Left blank, it goes in “${DEFAULT_AREA_NAME}”.`}
                            >
                                {(props) => (
                                    <input
                                        {...props}
                                        name="firstArea"
                                        maxLength={MAX_AREA_NAME_LENGTH}
                                        autoComplete="off"
                                        defaultValue={state.values?.firstArea}
                                        className={inputClass}
                                    />
                                )}
                            </Field>
                            <Field label="Priority">
                                {(props) => (
                                    <select
                                        {...props}
                                        name="firstPriority"
                                        defaultValue={state.values?.firstPriority ?? "MEDIUM"}
                                        className={inputClass}
                                    >
                                        {Object.entries(PRIORITY_LABELS).map(([key, label]) => (
                                            <option key={key} value={key}>
                                                {label}
                                            </option>
                                        ))}
                                    </select>
                                )}
                            </Field>
                        </div>
                    </FieldGroup>
                )}

                <FieldGroup title="Who and when">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field
                            label="Contractor"
                            error={state.errors?.contractorId}
                            hint="You can assign one later. Pick “In-house” if your own team does it."
                        >
                            {(props) => (
                                <Combobox
                                    controlProps={props}
                                    name="contractorId"
                                    value={selectedContractor}
                                    onChange={setSelectedContractor}
                                    options={contractorOptions(contractors)}
                                    searchPlaceholder="Search contractors"
                                    emptyText="No contractors match. Add a new one below."
                                    action={
                                        creating ? { label: "Add a new contractor", onSelect: goAddContractor } : undefined
                                    }
                                />
                            )}
                        </Field>
                        <Field label="Due date" optional error={state.errors?.dueDate}>
                            {(props) => (
                                <>
                                    <input
                                        {...props}
                                        ref={dueRef}
                                        type="date"
                                        name="dueDate"
                                        defaultValue={value("dueDate")}
                                        className={inputClass}
                                    />
                                    <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Quick due dates">
                                        {QUICK_DUE_DATES.map((quick) => (
                                            <button
                                                key={quick.days}
                                                type="button"
                                                onClick={() => {
                                                    if (dueRef.current) dueRef.current.value = daysFromToday(quick.days);
                                                    // Setting the value in code fires no change event, so save here.
                                                    if (creating && restoreDone.current && formRef.current) {
                                                        saveDraft(formRef.current);
                                                    }
                                                }}
                                                className="inline-flex h-10 items-center rounded-full border border-line-strong px-3 text-[0.8125rem] text-muted hover:cursor-pointer hover:border-line-hover hover:text-foreground pointer-fine:h-7"
                                            >
                                                {quick.label}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </Field>
                    </div>
                </FieldGroup>

                {/* Optional, so folded on a fresh form; open when it has something in it or an error. */}
                <FieldGroup
                    title="Notes and tenant"
                    collapsible
                    defaultOpen={!!value("notes") || contactTenant || !!state.errors?.notes}
                >
                    <Field
                        label="Notes for the contractor"
                        optional
                        error={state.errors?.notes}
                        hint="Access, parking, materials: anything they should know before they arrive."
                    >
                        {(props) => (
                            <textarea
                                {...props}
                                name="notes"
                                rows={4}
                                maxLength={MAX_NOTES_LENGTH}
                                defaultValue={value("notes")}
                                className={inputClass}
                            />
                        )}
                    </Field>

                    <div>
                        {/* Who would be emailed shows before the box is ticked, and the box is off when there's
                            nobody to email (a disabled box isn't submitted, so it saves as "don't email"). */}
                        <label
                            className={`flex items-start gap-3 text-sm ${tenantEmailable ? "hover:cursor-pointer" : "cursor-not-allowed"}`}
                        >
                            <input
                                key={responseCount}
                                name="tenant"
                                type="checkbox"
                                checked={contactTenant && tenantEmailable}
                                disabled={!tenantEmailable}
                                onChange={(e) => setContactTenant(e.target.checked)}
                                aria-describedby="tenant-email-status"
                                className="mt-0.5 h-4 w-4 shrink-0 accent-accent disabled:opacity-50"
                            />
                            <span>
                                <span
                                    className={`block font-medium ${tenantEmailable ? "text-foreground" : "text-muted"}`}
                                >
                                    Email the tenant when this is sent
                                </span>
                                <span className="block text-[0.8125rem] text-muted">
                                    They&apos;re told what the work is and who&apos;s doing it.
                                </span>
                            </span>
                        </label>
                        <p id="tenant-email-status" className="mt-2 ml-7 text-[0.8125rem] text-muted">
                            {sent
                                ? "This work order has already been sent, so the tenant won't be emailed."
                                : !selectedUnitId
                                  ? "Choose a unit to email its tenant."
                                  : !tenant
                                    ? "There's no tenant on file for this unit."
                                    : !tenant.email?.trim()
                                      ? `${tenant.displayName} has no email address on file.`
                                      : contactTenant
                                        ? `${tenant.displayName} (${tenant.email}) will be emailed when this is sent.`
                                        : `Tenant: ${tenant.displayName} (${tenant.email}).`}
                        </p>
                    </div>
                </FieldGroup>
            </div>

            <FormActions
                cancelHref={cancelHref}
                submitLabel={submitLabel}
                pending={pending}
                note={creating ? "You can add more areas and line items on the next step." : undefined}
            />
        </form>
    );
}
