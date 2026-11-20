"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { MailIcon } from "@/components/Icons";
import { useToast } from "@/components/Toaster";
import { cardClass } from "@/lib/ui";
import { answerRemindersPrompt } from "./(app)/settings/actions";

// Shown once to admins of organizations from before overdue reminders, while they have open work orders that aren't
// enrolled. Either answer hides it for the whole organization.
export default function RemindersPrompt(): React.ReactElement {
    const toast = useToast();
    const router = useRouter();
    const [pending, setPending] = useState<"enroll" | "skip" | null>(null);
    const [error, setError] = useState<string | null>(null);

    async function answer(enroll: boolean) {
        setPending(enroll ? "enroll" : "skip");
        setError(null);
        try {
            const result = await answerRemindersPrompt(enroll);
            if (!result.ok) {
                setError(result.error);
                return;
            }
            if (enroll) {
                toast(
                    result.enrolled === 1
                        ? "1 work order enrolled. If it's overdue, its contractor gets a reminder within a day."
                        : `${result.enrolled} work orders enrolled. Contractors of overdue ones get a reminder within a day.`,
                );
            }
            router.refresh();
        } catch {
            setError("Could not save. Try again.");
        } finally {
            setPending(null);
        }
    }

    return (
        <section
            aria-labelledby="reminders-prompt-title"
            className={`${cardClass} mb-10 flex flex-col gap-4 border-accent/30 p-4 sm:flex-row sm:items-center sm:p-5`}
        >
            <div className="flex min-w-0 flex-1 gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent-ink">
                    <MailIcon size={18} />
                </span>
                <div className="min-w-0">
                    <h2 id="reminders-prompt-title" className="text-sm font-semibold text-foreground">
                        New: reminders sent to contractors automatically when work is past due
                    </h2>
                    <p className="mt-0.5 text-sm text-muted">
                        Work orders created before this feature aren&apos;t included. Enroll your open work orders
                        now? Contractors of ones already overdue will get a reminder email within a day.
                    </p>
                    {error && (
                        <p role="alert" className="mt-1.5 text-sm text-danger">
                            {error}
                        </p>
                    )}
                </div>
            </div>
            <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
                <Button variant="ghost" onClick={() => answer(false)} pending={pending === "skip"} disabled={!!pending}>
                    No thanks
                </Button>
                <Button
                    variant="primary"
                    onClick={() => answer(true)}
                    pending={pending === "enroll"}
                    pendingLabel="Enrolling…"
                    disabled={!!pending}
                >
                    Enroll work orders
                </Button>
            </div>
        </section>
    );
}
