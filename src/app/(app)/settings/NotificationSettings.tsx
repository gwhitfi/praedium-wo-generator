"use client";

import { startTransition, useActionState } from "react";
import { NOTIFICATION_TYPES, type NotificationType } from "@/lib/notificationTypes";
import { setNotificationPreferences } from "./actions";
import type { NotificationFormState } from "./schemas";
import { Spinner } from "@/components/Button";
import { cardClass } from "@/lib/ui";

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
            aria-labelledby="notifications-title"
            className={`${cardClass} scroll-mt-24 overflow-hidden`}
        >
            {/* Saves on every change, without resetting the form (so the boxes don't flicker back while saving). */}
            <form
                onSubmit={(event) => event.preventDefault()}
                onChange={(event) => {
                    const data = new FormData(event.currentTarget);
                    startTransition(() => formAction(data));
                }}
            >
                <div className="p-5 sm:p-6">
                    <h3 id="notifications-title" className="text-base font-semibold text-foreground">
                        Notifications
                    </h3>
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
                                            <span className="block text-sm text-muted">{type.description}</span>
                                        </span>
                                    </label>
                                </li>
                            ))}
                        </ul>
                    </fieldset>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-line bg-background/40 px-5 py-3 sm:px-6">
                    <p className="text-[0.8125rem] text-muted">Changes save as you make them.</p>
                    <p role="status" className="flex items-center gap-2 text-sm">
                        {pending && (
                            <>
                                <Spinner className="h-3.5 w-3.5" />
                                <span className="text-muted">Saving…</span>
                            </>
                        )}
                        {!pending && state.error && <span className="text-danger">{state.error}</span>}
                        {!pending && state.ok && <span className="text-success">Saved.</span>}
                    </p>
                </div>
            </form>
        </section>
    );
}
