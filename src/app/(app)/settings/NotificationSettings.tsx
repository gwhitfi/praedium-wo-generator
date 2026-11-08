"use client";

import { useActionState } from "react";
import { NOTIFICATION_TYPES, type NotificationType } from "@/lib/notificationTypes";
import { setNotificationPreferences } from "./actions";
import type { NotificationFormState } from "./schemas";

// Which events show up under the bell in the header. `selected` is the user's current choice (the defaults if they
// never picked).
export default function NotificationSettings({ selected }: { selected: NotificationType[] }): React.ReactElement {
    const [state, formAction, pending] = useActionState<NotificationFormState, FormData>(
        setNotificationPreferences,
        {},
    );

    return (
        <section
            id="notifications"
            className="scroll-mt-24 overflow-hidden rounded-xl border border-line bg-surface shadow-sm"
        >
            <form action={formAction}>
                <div className="p-5 sm:p-6">
                    <h3 className="text-base font-semibold text-foreground sm:text-lg">Notifications</h3>
                    <p className="mt-1 text-sm text-muted">
                        Choose what shows up under the bell in the header. Things you do yourself are never included.
                    </p>
                    <fieldset className="mt-4">
                        <legend className="sr-only">Notify me about</legend>
                        <ul className="flex flex-col gap-3">
                            {NOTIFICATION_TYPES.map((type) => (
                                <li key={type.key}>
                                    <label className="flex items-start gap-3 text-sm hover:cursor-pointer">
                                        <input
                                            type="checkbox"
                                            name="types"
                                            value={type.key}
                                            defaultChecked={selected.includes(type.key)}
                                            className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
                                        />
                                        <span>
                                            <span className="block font-medium text-foreground">
                                                {type.label}
                                                {type.default && (
                                                    <span className="ml-2 text-xs font-normal text-subtle">
                                                        Default
                                                    </span>
                                                )}
                                            </span>
                                            <span className="block text-xs text-subtle">{type.description}</span>
                                        </span>
                                    </label>
                                </li>
                            ))}
                        </ul>
                    </fieldset>
                </div>
                <div className="flex items-center justify-end gap-3 border-t border-line bg-background/40 px-5 py-3 sm:px-6">
                    {state.error && <p className="text-sm text-danger">{state.error}</p>}
                    {state.ok && !pending && <p className="text-sm text-success">Saved</p>}
                    <button
                        type="submit"
                        disabled={pending}
                        className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-on-accent hover:bg-accent-hover hover:cursor-pointer disabled:opacity-60"
                    >
                        {pending ? "Saving…" : "Save"}
                    </button>
                </div>
            </form>
        </section>
    );
}
