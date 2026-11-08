"use client";
import { useActionState, useState } from "react";
import { createContact } from "../actions";
import type { ContactFormState } from "../schemas";
import { CONTACT_TYPE_LABELS, inputClass, labelClass, US_STATE_LABELS } from "@/lib/defaults";

type UnitOption = { id: string; name: string };
type PropertyOption = {
    id: string;
    displayName: string;
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

export default function ContactForm({
    properties,
    initial,
    action = createContact,
    submitLabel = "Save contact",
    lockType = false,
}: {
    properties: PropertyOption[];
    initial?: ContactFormValues;
    action?: (state: ContactFormState, formData: FormData) => Promise<ContactFormState>;
    submitLabel?: string;
    lockType?: boolean;
}) {
    const [state, formAction, pending] = useActionState(action, {});
    // React resets the form after each submit, so refill it with what was sent.
    const value = (name: Exclude<keyof ContactFormValues, "inHouse">) => state.values?.[name] ?? initial?.[name];
    const inHouseChecked = state.values ? state.values.inHouse === "on" : (initial?.inHouse ?? false);
    const editing = !!initial;
    const [contactType, setContactType] = useState(initial?.contactType ?? "CONTRACTOR");
    const [selectedProperty, setSelectedProperty] = useState(initial?.propertyId ?? "");
    const units = properties.find((p) => p.id === selectedProperty)?.units ?? [];

    return (
        <form action={formAction} autoComplete="off" noValidate className="flex flex-col gap-4">
            <label className={labelClass}>
                Display name
                <input
                    name="displayName"
                    required
                    maxLength={100}
                    defaultValue={value("displayName")}
                    className={inputClass}
                />
                <FieldError errors={state.errors?.displayName} />
            </label>
            <label className={labelClass}>
                Contact type
                <select
                    name={lockType ? undefined : "contactType"}
                    required
                    disabled={lockType}
                    className={`${inputClass} disabled:opacity-60`}
                    value={contactType}
                    onChange={(e) => setContactType(e.target.value)}
                >
                    {Object.entries(CONTACT_TYPE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                            {label}
                        </option>
                    ))}
                </select>
                <FieldError errors={state.errors?.contactType} />
                {lockType && (
                    <>
                        <input type="hidden" name="contactType" value={contactType} />
                        <span className="mt-1 block text-xs font-normal text-subtle">
                            Locked because this contact is on work orders.
                        </span>
                    </>
                )}
            </label>
            <div className="grid grid-cols-2 gap-3">
                <label className={labelClass}>
                    First name
                    <input name="firstName" maxLength={50} defaultValue={value("firstName")} className={inputClass} />
                    <FieldError errors={state.errors?.firstName} />
                </label>
                <label className={labelClass}>
                    Last name
                    <input name="lastName" maxLength={50} defaultValue={value("lastName")} className={inputClass} />
                    <FieldError errors={state.errors?.lastName} />
                </label>
            </div>
            {contactType !== "TENANT" && (
                <div className="flex flex-col gap-4">
                    <label className={labelClass}>
                        Company
                        <input name="company" maxLength={100} defaultValue={value("company")} className={inputClass} />
                        <FieldError errors={state.errors?.company} />
                    </label>
                    <label className="flex items-start gap-2 text-sm text-secondary">
                        <input
                            type="checkbox"
                            name="inHouse"
                            defaultChecked={inHouseChecked}
                            className="mt-0.5 h-4 w-4 rounded border-line-strong bg-surface"
                        />
                        <span>
                            <span className="font-medium">In-house (our employee)</span>
                            <span className="block text-xs text-subtle">
                                Listed first when assigning work orders. They still get the work order link by email.
                            </span>
                        </span>
                    </label>
                    <label className={labelClass}>
                        Address
                        <input name="addressLine1" defaultValue={value("addressLine1")} className={inputClass} />
                        <FieldError errors={state.errors?.addressLine1} />
                    </label>
                    <label className={labelClass}>
                        Address (cont)
                        <input name="addressLine2" defaultValue={value("addressLine2")} className={inputClass} />
                        <FieldError errors={state.errors?.addressLine2} />
                    </label>
                    <div className="grid grid-cols-6 gap-3">
                        <label className="col-span-3 block">
                            <span className={labelClass}>City</span>
                            <input name="city" defaultValue={value("city")} className={inputClass} />
                            <FieldError errors={state.errors?.city} />
                        </label>

                        <label className="col-span-1 block">
                            <span className={labelClass}>State</span>
                            <select name="state" defaultValue={value("state")} className={inputClass}>
                                <option value="">—</option>
                                {Object.entries(US_STATE_LABELS).map(([code, name]) => (
                                    <option key={code} value={code} title={name}>
                                        {code}
                                    </option>
                                ))}
                            </select>
                            <FieldError errors={state.errors?.state} />
                        </label>

                        <label className="col-span-2 block">
                            <span className={labelClass}>Zip code</span>
                            <input name="zipCode" defaultValue={value("zipCode")} className={inputClass} />
                            <FieldError errors={state.errors?.zipCode} />
                        </label>
                    </div>
                </div>
            )}
            {contactType === "TENANT" && (
                <div className="flex flex-col gap-4">
                    <label className={labelClass}>
                        Property
                        <select
                            name="propertyId"
                            required={!editing}
                            className={inputClass}
                            value={selectedProperty}
                            onChange={(e) => setSelectedProperty(e.target.value)}
                        >
                            <option value="">{editing ? "No property" : "Select a property"}</option>
                            {properties.map((property) => (
                                <option key={property.id} value={property.id}>
                                    {property.displayName}
                                </option>
                            ))}
                        </select>
                        <FieldError errors={state.errors?.propertyId} />
                    </label>

                    {units.length > 1 && (
                        <label className={labelClass}>
                            Unit
                            <select
                                key={selectedProperty}
                                name="unitId"
                                required
                                defaultValue={
                                    state.values?.unitId ??
                                    (selectedProperty === initial?.propertyId ? initial.unitId : "")
                                }
                                className={inputClass}
                            >
                                <option value="">Select a unit</option>
                                {units.map((unit) => (
                                    <option key={unit.id} value={unit.id}>
                                        {unit.name}
                                    </option>
                                ))}
                            </select>
                            <FieldError errors={state.errors?.unitId} />
                        </label>
                    )}
                    {units.length === 1 && <input type="hidden" name="unitId" value={units[0].id} />}
                </div>
            )}
            <div className="grid grid-cols-2 gap-3">
                <label className={labelClass}>
                    Phone number
                    <input type="tel" name="phone" required defaultValue={value("phone")} className={inputClass} />
                    <FieldError errors={state.errors?.phone} />
                </label>
                <label className={labelClass}>
                    Email
                    <input type="email" name="email" required defaultValue={value("email")} className={inputClass} />
                    <FieldError errors={state.errors?.email} />
                </label>
            </div>
            <label className={labelClass}>
                Notes <textarea name="notes" maxLength={5000} defaultValue={value("notes")} className={inputClass} />
                <FieldError errors={state.errors?.notes} />
            </label>
            {state.error && <p className="text-sm text-danger">{state.error}</p>}
            <button
                type="submit"
                disabled={pending}
                className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover  hover:cursor-pointer disabled:opacity-60"
            >
                {submitLabel}
            </button>
        </form>
    );
}

function FieldError({ errors }: { errors?: string[] }) {
    if (!errors?.length) return null;
    return <p className="mt-1 text-sm font-normal text-danger">{errors[0]}</p>;
}
