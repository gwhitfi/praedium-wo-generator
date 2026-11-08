"use client";

import { startTransition, useActionState, useEffect, useRef, type FormEvent } from "react";
import { inputClass } from "@/lib/defaults";
import type { ContractorOption, PropertyOption } from "@/lib/workOrderLookup";
import { parseWorkOrderDescription } from "./actions";
import ReviewDraft from "./ReviewDraft";
import type { ParseState } from "./schemas";

// The description is saved in this browser as the user types, so a refresh, a closed tab or an error never loses it.
const STORAGE_KEY = "praedium-bot-description";

function saveDescription(text: string) {
    try {
        localStorage.setItem(STORAGE_KEY, text);
    } catch {
        // Storage can be blocked (e.g. private browsing); the text box still works for this visit.
    }
}

function clearSavedDescription() {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch {
        // See saveDescription.
    }
}

export default function BotForm({
    properties,
    contractors,
}: {
    properties: PropertyOption[];
    contractors: ContractorOption[];
}) {
    const [state, action, pending] = useActionState(parseWorkOrderDescription, {} as ParseState);
    const textarea = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved && textarea.current && !textarea.current.value) textarea.current.value = saved;
        } catch {
            // See saveDescription.
        }
    }, []);

    // Called from onSubmit rather than <form action>, which resets the form afterwards and would clear the text box.
    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(() => action(formData));
    }

    return (
        <form onSubmit={submit} className="flex flex-col gap-4">
            <textarea
                ref={textarea}
                name="description"
                rows={12}
                required
                onChange={(e) => saveDescription(e.target.value)}
                placeholder="Example: 123 Maple St, unit 4B, for Joe's Plumbing by Friday. Kitchen: the sink is leaking under the cabinet and the disposal is jammed. Bathroom: recaulk the tub."
                className={inputClass}
            />
            <p className="text-xs text-subtle">
                To speak instead of typing, tap the microphone on your phone&apos;s keyboard. On Windows press Win+H; on
                a Mac press the Fn key twice.
            </p>
            {state.error && (
                <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                    {state.error}
                </p>
            )}
            <button
                type="submit"
                disabled={pending}
                className="self-start rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover hover:cursor-pointer disabled:opacity-60"
            >
                {pending ? "Reading your description..." : state.result ? "Read it again" : "Review work order"}
            </button>

            {state.result && (
                <ReviewDraft
                    // A new reading starts a fresh review.
                    key={JSON.stringify(state.result.draft)}
                    result={state.result}
                    properties={properties}
                    contractors={contractors}
                    onCreateStart={clearSavedDescription}
                    onCreateFailed={() => saveDescription(textarea.current?.value ?? "")}
                />
            )}
        </form>
    );
}
