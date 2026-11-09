"use client";

import { useEffect, useState } from "react";
import { completeWorkOrder } from "./actions";
import { clearTextDraft, readTextDraft, saveTextDraft } from "@/lib/formDraft";
import { inputClass } from "@/lib/defaults";
import { cardClass } from "@/lib/ui";
import { Button } from "@/components/Button";

// The contractor's last step: optional notes for the office, then "Mark as completed" with a confirmation.
export default function CompleteWorkOrder({ token, remainingCount }: { token: string; remainingCount: number }) {
    // Unsent notes are kept in this browser, so a reload or a dropped connection doesn't lose them.
    const draftKey = `praedium-completion-notes:${token}`;
    const [notes, setNotes] = useState("");
    const [confirming, setConfirming] = useState(false);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const saved = readTextDraft(draftKey);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- a one-time restore from browser storage
        if (saved) setNotes(saved);
    }, [draftKey]);

    async function handleComplete() {
        setPending(true);
        try {
            await completeWorkOrder(token, notes);
            clearTextDraft(draftKey);
            setError(null);
        } catch {
            setError("Couldn't complete the work order. Check your connection and try again.");
            setConfirming(false);
        } finally {
            setPending(false);
        }
    }

    return (
        <section aria-labelledby="finish-title" className={`${cardClass} mt-8 p-4 sm:p-5`}>
            <h2 id="finish-title" className="text-lg font-semibold text-foreground">
                Finish up
            </h2>
            <p className="mt-1 text-sm text-muted">
                When the work is done, add any final notes and mark the work order as completed. The office is told
                right away.
            </p>

            <label htmlFor="completion-notes" className="mt-4 mb-1 block text-sm font-medium text-secondary">
                Notes for the office <span className="font-normal text-subtle">(optional)</span>
            </label>
            <textarea
                id="completion-notes"
                value={notes}
                onChange={(e) => {
                    setNotes(e.target.value);
                    saveTextDraft(draftKey, e.target.value);
                }}
                rows={4}
                maxLength={2000}
                placeholder="Anything left to do, parts you used, follow-up needed"
                className={inputClass}
            />

            {remainingCount > 0 && (
                <p className="mt-3 text-sm text-warning">
                    {remainingCount} {remainingCount === 1 ? "item isn't" : "items aren't"} checked off yet.
                </p>
            )}

            <div className="mt-4">
                {confirming ? (
                    <div
                        role="group"
                        aria-label="Confirm completion"
                        className="rounded-lg border border-line-strong/70 bg-background/40 p-3"
                    >
                        <p className="text-sm font-medium text-foreground">Mark this work order as completed?</p>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                            <Button onClick={() => setConfirming(false)} disabled={pending}>
                                Go back
                            </Button>
                            <Button
                                variant="primary"
                                onClick={handleComplete}
                                pending={pending}
                                pendingLabel="Submitting…"
                                autoFocus
                            >
                                Yes, completed
                            </Button>
                        </div>
                    </div>
                ) : (
                    <Button variant="primary" size="lg" full data-demo-guide="finish" onClick={() => setConfirming(true)}>
                        Mark as completed
                    </Button>
                )}
            </div>

            {error && (
                <p role="alert" className="mt-2 text-sm text-danger">
                    {error}
                </p>
            )}
        </section>
    );
}
