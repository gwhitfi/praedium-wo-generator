"use client";

import { useActionState, useRef, useState } from "react";
import { updateOrganization } from "./actions";
import { inputClass } from "@/lib/defaults";
import { buttonClass, cardClass } from "@/lib/ui";
import { Field } from "@/components/form/Field";

export default function OrganizationContactForm({
    name,
    phone,
    email,
}: {
    name: string;
    phone: string | null;
    email: string | null;
}): React.ReactElement {
    const [state, formAction, pending] = useActionState(updateOrganization, {});
    // React resets the form after each submit, so refill it with what was sent.
    const values = state.values;
    // Like the rest of Settings, it saves without a Save button: when a changed field is left, or on Enter.
    const formRef = useRef<HTMLFormElement>(null);
    const [dirty, setDirty] = useState(false);
    const [shownState, setShownState] = useState(state);
    if (state !== shownState) {
        setShownState(state);
        if (state.ok) setDirty(false);
    }
    const save = () => {
        if (dirty && !pending) formRef.current?.requestSubmit();
    };

    return (
        <form
            ref={formRef}
            action={formAction}
            noValidate
            onChange={() => setDirty(true)}
            onBlur={(event) => {
                // Moving between this card's own fields doesn't count as leaving.
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) save();
            }}
            onKeyDown={(event) => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    save();
                }
            }}
            className={`${cardClass} overflow-hidden`}
        >
            <div className="p-5 sm:p-6">
                <h3 className="text-base font-semibold text-foreground">Contact details</h3>
                <p className="mt-1 text-sm text-muted">
                    Contractors see your name, phone and email on the work orders and emails you send them.
                </p>

                <div className="mt-5 flex flex-col gap-4">
                    <Field label="Organization name" required error={state.errors?.name}>
                        {(props) => (
                            <input
                                {...props}
                                name="name"
                                defaultValue={values?.name ?? name}
                                required
                                className={inputClass}
                            />
                        )}
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Office phone" error={state.errors?.phone}>
                            {(props) => (
                                <input
                                    {...props}
                                    type="tel"
                                    name="phone"
                                    inputMode="tel"
                                    defaultValue={values?.phone ?? phone ?? ""}
                                    className={inputClass}
                                />
                            )}
                        </Field>
                        <Field label="Office email" error={state.errors?.email}>
                            {(props) => (
                                <input
                                    {...props}
                                    type="email"
                                    name="email"
                                    defaultValue={values?.email ?? email ?? ""}
                                    className={inputClass}
                                />
                            )}
                        </Field>
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-line bg-background/40 px-5 py-3 sm:px-6">
                <p className="min-w-0 text-sm" role="status">
                    {pending ? (
                        <span className="text-muted">Saving…</span>
                    ) : state.error ? (
                        <span className="text-danger">{state.error}</span>
                    ) : dirty ? (
                        <span className="text-muted">Saves when you click or tab away from these fields.</span>
                    ) : state.ok ? (
                        <span className="text-success">Saved.</span>
                    ) : (
                        <span className="text-muted">Changes save when you leave these fields.</span>
                    )}
                </p>
                {/* A way to save right away, for anyone who'd rather not rely on leaving the field. */}
                {dirty && !pending && (
                    <button
                        type="button"
                        // Keeps focus in the form, so the click itself doesn't count as leaving and save twice.
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={save}
                        className={buttonClass({ size: "sm", variant: "ghost" })}
                    >
                        Save now
                    </button>
                )}
            </div>
        </form>
    );
}
