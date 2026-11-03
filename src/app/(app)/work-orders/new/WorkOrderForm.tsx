"use client";

import { useState } from "react";
import { createWorkOrder } from "../actions";
import { inputClass, labelClass } from "@/lib/defaults";
import { useRouter } from "next/navigation";

type UnitOption = { id: string; name: string };
type PropertyOption = {
    id: string;
    displayName: string;
    units: UnitOption[];
};
type ContactOption = {
    id: string;
    displayName: string;
    company: string | null;
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
    contractorId: string;
    notes: string;
    dueDate: string; // YYYY-MM-DD
    notifyTenant: boolean;
};

const ADD_NEW = "__add_new__";

export default function WorkOrderForm({
    properties,
    contractors,
    tenants,
    defaultPropertyId,
    initial,
    action = createWorkOrder,
    submitLabel = "Save and Continue",
    lockProperty = false,
    sent = false,
}: {
    properties: PropertyOption[];
    contractors: ContactOption[];
    tenants: TenantOption[];
    defaultPropertyId?: string;
    initial?: WorkOrderFormValues;
    action?: (formData: FormData) => void | Promise<void>;
    submitLabel?: string;
    lockProperty?: boolean;
    // The work order has already gone to the contractor, so the tenant email won't be sent.
    sent?: boolean;
}) {
    const [selectedProperty, setSelectedProperty] = useState(initial?.propertyId ?? defaultPropertyId ?? "");
    const [selectedContractor, setSelectedContractor] = useState(initial?.contractorId ?? "");
    const [selectedUnit, setSelectedUnit] = useState(initial?.unitId ?? "");
    const property = properties.find((p) => p.id === selectedProperty);
    const units = property?.units ?? [];
    const selectedUnitId = units.length === 1 ? units[0].id : selectedUnit;
    const tenant = tenants.find((t) => t.unitId === selectedUnitId);
    const [contactTenant, setContactTenant] = useState(initial?.notifyTenant ?? false);

    const router = useRouter();
    return (
        <form action={action} autoComplete="off" className="flex flex-col gap-4">
            <label className={labelClass}>
                Work Order Title
                <input name="title" required defaultValue={initial?.title} className={inputClass} />
            </label>

            <div className="grid grid-cols-2 gap-3">
                {lockProperty ? (
                    <div className={labelClass}>
                        Property
                        <p className="mt-1 py-2 text-sm text-foreground">{property?.displayName}</p>
                        <p className="text-xs font-normal text-subtle">
                            To use a different property, create a new work order.
                        </p>
                    </div>
                ) : (
                    <label className={labelClass}>
                        Select a property
                        <select
                            name="propertyId"
                            required
                            className={inputClass}
                            value={selectedProperty}
                            onChange={(e) => {
                                if (e.target.value === ADD_NEW) {
                                    router.push("/properties/new?returnTo=/work-orders/new");
                                    return;
                                }
                                setSelectedProperty(e.target.value);
                                setSelectedUnit("");
                            }}
                        >
                            <option value="">Select a property</option>
                            <option value={ADD_NEW}>Add new property</option>
                            {properties.map((property) => (
                                <option key={property.id} value={property.id}>
                                    {property.displayName}
                                </option>
                            ))}
                        </select>
                    </label>
                )}
                {units.length > 1 && (
                    <label className={labelClass}>
                        Unit
                        <select
                            name="unitId"
                            required
                            className={inputClass}
                            value={selectedUnit}
                            onChange={(e) => setSelectedUnit(e.target.value)}
                        >
                            <option value="">Select a unit</option>
                            {units.map((unit) => (
                                <option key={unit.id} value={unit.id}>
                                    {unit.name}
                                </option>
                            ))}
                        </select>
                    </label>
                )}
            </div>
            <label className={labelClass}>
                Select a contractor
                <select
                    name="contractorId"
                    className={inputClass}
                    value={selectedContractor}
                    onChange={(e) => setSelectedContractor(e.target.value)}
                >
                    <option value="">Assign later</option>
                    {contractors.map((contractor) => (
                        <option key={contractor.id} value={contractor.id}>
                            {contractor.displayName}
                            {contractor.company ? ` — ${contractor.company}` : ""}
                        </option>
                    ))}
                </select>
            </label>
            {units.length === 1 && <input type="hidden" name="unitId" value={units[0].id} />}
            <label className={labelClass}>
                Notes <textarea name="notes" defaultValue={initial?.notes} className={inputClass} />
            </label>
            <label className={labelClass}>
                Due date
                <input type="date" name="dueDate" defaultValue={initial?.dueDate} className={inputClass} />
            </label>
            <label className={labelClass}>
                Send notification to tenant?{" "}
                <input
                    name="tenant"
                    type="checkbox"
                    checked={contactTenant}
                    className="h-4 w-4 rounded border-line-strong bg-surface"
                    onChange={(e) => setContactTenant(e.target.checked)}
                />
            </label>
            {contactTenant &&
                (sent ? (
                    <p className="text-sm text-muted">
                        This work order has already been sent, so the tenant won&apos;t be emailed.
                    </p>
                ) : !tenant ? (
                    <p className="text-sm text-warning">No tenant on file for this unit.</p>
                ) : !tenant.email?.trim() ? (
                    <p className="text-sm text-warning">
                        {tenant.displayName} has no email address, so they won&apos;t be notified.
                    </p>
                ) : (
                    <p className="text-sm text-muted">
                        {tenant.displayName} ({tenant.email}) will be emailed when this work order is sent to the
                        contractor.
                    </p>
                ))}
            <button
                type="submit"
                className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover  hover:cursor-pointer"
            >
                {submitLabel}
            </button>
        </form>
    );
}
