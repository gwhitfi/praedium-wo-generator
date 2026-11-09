"use client";

import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { inputClass } from "@/lib/defaults";
import { cardClass } from "@/lib/ui";
import { Button } from "@/components/Button";
import { SparklesIcon } from "@/components/Icons";
import RestoredNotice from "@/components/form/RestoredNotice";
import type { ContractorOption, PropertyOption } from "@/lib/workOrderLookup";
import { parseWorkOrderDescription } from "./actions";
import ReviewDraft from "./ReviewDraft";
import type { ParseState } from "./schemas";
import { decodeSavedDescription, encodeSavedDescription, SAVED_DESCRIPTION_KEY } from "./savedDescription";

// The description is saved in this browser as the user types, so a refresh, a closed tab or an error never loses it.
function saveDescription(text: string) {
    try {
        localStorage.setItem(SAVED_DESCRIPTION_KEY, encodeSavedDescription(text));
    } catch {
        // Storage can be blocked (e.g. private browsing); the text box still works for this visit.
    }
}

function clearSavedDescription() {
    try {
        localStorage.removeItem(SAVED_DESCRIPTION_KEY);
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
    // Set when an unsent description from an earlier visit was put back, to say so and offer to start fresh.
    const [restored, setRestored] = useState<{ savedAt: Date | null } | null>(null);

    useEffect(() => {
        let raw: string | null = null;
        try {
            raw = localStorage.getItem(SAVED_DESCRIPTION_KEY);
        } catch {
            // See saveDescription.
        }
        const saved = decodeSavedDescription(raw);
        if (!saved) {
            // Too old or empty: forget it.
            if (raw) clearSavedDescription();
            return;
        }
        if (textarea.current && !textarea.current.value) {
            textarea.current.value = saved.text;
            setRestored({ savedAt: saved.savedAt });
        }
    }, []);

    function startFresh() {
        clearSavedDescription();
        if (textarea.current) {
            textarea.current.value = "";
            textarea.current.focus();
        }
        setRestored(null);
    }

    // Called from onSubmit rather than <form action>, which resets the form afterwards and would clear the text box.
    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(() => action(formData));
    }

    return (
        <form onSubmit={submit} className="flex flex-col gap-4">
            <div className={`${cardClass} p-5 sm:p-6`}>
                <label htmlFor="bot-description" className="mb-1 block text-sm font-medium text-secondary">
                    Describe the work
                </label>
                <p id="bot-description-hint" className="mb-3 text-sm text-muted">
                    Include the property address and the contractor&apos;s name. Leave out phone numbers and tenant
                    details. Photos are added afterwards.
                </p>
                {restored && (
                    <div className="mb-3">
                        <RestoredNotice what="the description" savedAt={restored.savedAt} onStartFresh={startFresh} />
                    </div>
                )}
                <textarea
                    id="bot-description"
                    ref={textarea}
                    name="description"
                    rows={10}
                    required
                    aria-describedby="bot-description-hint bot-dictation-hint"
                    onChange={(e) => saveDescription(e.target.value)}
                    placeholder="Example: 123 Maple St, unit 4B, for Joe's Plumbing by Friday. Kitchen: the sink is leaking under the cabinet and the disposal is jammed. Bathroom: recaulk the tub."
                    className={inputClass}
                />
                <p id="bot-dictation-hint" className="mt-2 text-[0.8125rem] text-muted">
                    To talk instead of typing, tap the microphone on your phone&apos;s keyboard. On Windows press Win+H;
                    on a Mac press the Fn key twice.
                </p>
                {state.error && (
                    <p role="alert" className="mt-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                        {state.error}
                    </p>
                )}
                <div className="mt-4 flex justify-end">
                    <Button
                        type="submit"
                        variant={state.result ? "secondary" : "primary"}
                        pending={pending}
                        pendingLabel="Reading your description…"
                    >
                        <SparklesIcon size={16} />
                        {state.result ? "Read it again" : "Draft the work order"}
                    </Button>
                </div>
            </div>

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
