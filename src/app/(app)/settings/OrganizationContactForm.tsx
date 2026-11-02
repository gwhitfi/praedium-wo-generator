"use client";

import { useActionState } from "react";
import { updateOrganization } from "./actions";
import { inputClass, labelClass } from "@/lib/defaults";

export default function OrganizationContactForm({
    name,
    phone,
    email,
}: {
    name: string;
    phone: string | null;
    email: string | null;
}) {
    const [state, formAction, pending] = useActionState(updateOrganization, {});
    // React resets the form after each submit, so refill it with what was sent.
    const values = state.values;

    return (
        <form
            action={formAction}
            noValidate
            className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm"
        >
            <div className="p-5 sm:p-6">
                <h3 className="text-base font-semibold text-foreground sm:text-lg">Contact details</h3>
                <p className="mt-1 text-sm text-muted">
                    Your name, phone and email are shown to contractors on the work orders and emails you send them.
                </p>

                <div className="mt-5 flex flex-col gap-4">
                    <label className={labelClass}>
                        Organization Name
                        <input name="name" defaultValue={values?.name ?? name} required className={inputClass} />
                        <FieldError errors={state.errors?.name} />
                    </label>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <label className={labelClass}>
                            Office Phone
                            <input
                                type="tel"
                                name="phone"
                                defaultValue={values?.phone ?? phone ?? ""}
                                className={inputClass}
                            />
                            <FieldError errors={state.errors?.phone} />
                        </label>
                        <label className={labelClass}>
                            Office Email
                            <input
                                type="email"
                                name="email"
                                defaultValue={values?.email ?? email ?? ""}
                                className={inputClass}
                            />
                            <FieldError errors={state.errors?.email} />
                        </label>
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-line bg-background/40 px-5 py-3 sm:px-6">
                <p className="min-w-0 text-sm" role="status">
                    {state.ok && <span className="text-success">Saved.</span>}
                    {state.error && <span className="text-danger">{state.error}</span>}
                </p>
                <button
                    type="submit"
                    disabled={pending}
                    className="shrink-0 rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover hover:cursor-pointer disabled:opacity-40"
                >
                    {pending ? "Saving..." : "Save"}
                </button>
            </div>
        </form>
    );
}

function FieldError({ errors }: { errors?: string[] }) {
    if (!errors?.length) return null;
    return <p className="mt-1 text-sm font-normal text-danger">{errors[0]}</p>;
}
