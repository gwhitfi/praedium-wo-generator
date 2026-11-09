"use client";

import { useState } from "react";
import Link from "next/link";
import {
    sendWorkOrder,
    emailWorkOrder,
    markWorkOrderCompleted,
    reopenWorkOrder,
    closeWorkOrder,
    cancelWorkOrder,
    startWorkOrder,
} from "../actions";
import { DeliveryMethod } from "@/generated/prisma/enums";
import { Button, ButtonLink } from "@/components/Button";
import { useToast } from "@/components/Toaster";
import { PrinterIcon, SendIcon } from "@/components/Icons";
import { buttonClass, cardClass, cardTitleClass, noticeClass, textLinkClass } from "@/lib/ui";
import { inputClass } from "@/lib/defaults";

type Contractor = { id: string; name: string; email: string | null };
type Confirming = "email" | "complete" | null;

// An error message from an action's { ok: false, error } result, safe to show as is. Errors thrown on the server
// arrive without their message in production, so those get the generic text.
class ActionError extends Error {}

// The work order's "Next step" card: what's happening now, the one action that moves it forward (a filled button),
// and any secondary actions. Cancelling lives in the page's danger zone instead (CancelWorkOrderButton).
export default function StatusActions({
    workOrderId,
    status,
    inHouse,
    contractor,
    doneCount,
    itemCount,
    archived,
}: {
    workOrderId: string;
    status: string;
    // Handled by the office: started instead of sent, with no contractor emails.
    inHouse: boolean;
    contractor: Contractor | null;
    doneCount: number;
    itemCount: number;
    archived: boolean;
}): React.ReactElement {
    const toast = useToast();
    const [pending, setPending] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [confirming, setConfirming] = useState<Confirming>(null);

    const remaining = itemCount - doneCount;
    const name = contractor?.name ?? "the contractor";

    async function run(key: string, fn: () => Promise<void>, success: string) {
        setPending(key);
        setError(null);
        try {
            await fn();
            setConfirming(null);
            toast(success);
        } catch (e) {
            setError(e instanceof ActionError ? e.message : "Something went wrong. Try again.");
        } finally {
            setPending(null);
        }
    }

    const email = () =>
        run(
            "email",
            async () => {
                const res = await emailWorkOrder(workOrderId);
                if (!res.ok) throw new ActionError(res.error);
            },
            `Emailed to ${contractor?.email ?? name}.`,
        );

    const complete = () =>
        run("complete", () => markWorkOrderCompleted(workOrderId), "Marked as completed. Review it, then close it.");

    let message: React.ReactNode;
    let body: React.ReactNode;

    if (archived) {
        message = "This work order is archived. Restore it to make changes.";
        body = null;
    } else if (status === "DRAFT" && inHouse) {
        // Like sending, starting needs at least one line item; the server refuses too (src/lib/workOrderStart.ts).
        message =
            itemCount === 0
                ? "Add at least one line item to the work below, then you can start it."
                : "Your team is doing this work. Start it when they begin.";
        body = (
            <Button
                variant="primary"
                full
                disabled={itemCount === 0}
                pending={pending === "start"}
                pendingLabel="Starting…"
                onClick={() =>
                    run(
                        "start",
                        async () => {
                            const res = await startWorkOrder(workOrderId);
                            if (!res.ok) throw new ActionError(res.error);
                        },
                        "Work started.",
                    )
                }
            >
                Start work
            </Button>
        );
    } else if (status === "DRAFT" && !contractor) {
        message = "Choose who's doing the work: a contractor, or your own team.";
        body = (
            <ButtonLink href={`/work-orders/${workOrderId}/edit`} variant="primary" full>
                Choose a contractor
            </ButtonLink>
        );
    } else if (status === "DRAFT" && itemCount === 0) {
        // Nothing to send yet: the server refuses too (src/lib/workOrderSend.ts, sendWorkOrder).
        message = "Add at least one line item to the work below, then you can send it.";
        body = (
            <Button variant="primary" full disabled>
                <SendIcon />
                {contractor?.email ? "Send by email" : "Mark as sent"}
            </Button>
        );
    } else if (status === "DRAFT") {
        message = contractor?.email ? (
            <>
                Ready to send to <strong className="font-medium text-foreground">{name}</strong>. They get an email
                with a link to check off the work. No account needed.
            </>
        ) : (
            <>
                <Link href={`/contacts/${contractor?.id}`} className={textLinkClass}>
                    Add an email to {name}
                </Link>{" "}
                to send it by email, or share the link yourself and mark it as sent.
            </>
        );
        body =
            confirming === "email" ? (
                <ConfirmRow
                    question={`Email this work order to ${contractor?.email}?`}
                    confirmLabel="Send email"
                    pending={pending === "email"}
                    pendingLabel="Sending…"
                    onConfirm={email}
                    onCancel={() => setConfirming(null)}
                />
            ) : (
                <>
                    {contractor?.email && (
                        <Button variant="primary" full onClick={() => setConfirming("email")} disabled={!!pending}>
                            <SendIcon />
                            Send by email
                        </Button>
                    )}
                    <Button
                        variant={contractor?.email ? "secondary" : "primary"}
                        full
                        pending={pending === "sent"}
                        pendingLabel="Saving…"
                        disabled={!!pending}
                        onClick={() =>
                            run(
                                "sent",
                                () => sendWorkOrder(workOrderId, "PRINT" as DeliveryMethod),
                                "Marked as sent. The contractor link is live.",
                            )
                        }
                    >
                        Mark as sent
                    </Button>
                    {contractor?.email && (
                        <p className="text-[0.8125rem] text-muted">
                            Use &ldquo;Mark as sent&rdquo; if you printed it or shared the link another way.
                        </p>
                    )}
                </>
            );
    } else if (status === "SENT" || status === "IN_PROGRESS") {
        message = inHouse ? (
            `Your team is working on it: ${doneCount} of ${itemCount} items done. Check items off as they're finished.`
        ) : status === "SENT" ? (
            <>
                Sent to <strong className="font-medium text-foreground">{name}</strong>. Waiting for them to start.
            </>
        ) : (
            <>
                <strong className="font-medium text-foreground">{name}</strong> is working on it: {doneCount} of{" "}
                {itemCount} items done.
            </>
        );
        body =
            confirming === "complete" ? (
                <ConfirmRow
                    question={
                        remaining > 0
                            ? `Mark as completed? ${remaining} ${remaining === 1 ? "item isn't" : "items aren't"} checked off yet.`
                            : "Mark this work order as completed?"
                    }
                    confirmLabel="Mark completed"
                    pending={pending === "complete"}
                    pendingLabel="Saving…"
                    onConfirm={complete}
                    onCancel={() => setConfirming(null)}
                />
            ) : confirming === "email" ? (
                <ConfirmRow
                    question={`Email this work order to ${contractor?.email} again?`}
                    confirmLabel="Resend email"
                    pending={pending === "email"}
                    pendingLabel="Sending…"
                    onConfirm={email}
                    onCancel={() => setConfirming(null)}
                />
            ) : (
                <>
                    {/* The main (green) button only once every item is checked off; until then completing early is
                        possible but not what the page pushes. */}
                    <Button
                        variant={itemCount > 0 && remaining === 0 ? "primary" : "secondary"}
                        full
                        onClick={() => setConfirming("complete")}
                        disabled={!!pending}
                    >
                        Mark as completed
                    </Button>
                    {!inHouse && contractor?.email && (
                        <Button full onClick={() => setConfirming("email")} disabled={!!pending}>
                            <SendIcon />
                            Resend email
                        </Button>
                    )}
                    {!inHouse && contractor && !contractor.email && (
                        <p className="text-[0.8125rem] text-muted">
                            <Link href={`/contacts/${contractor.id}`} className={textLinkClass}>
                                Add an email to {contractor.name}
                            </Link>{" "}
                            to send it by email.
                        </p>
                    )}
                </>
            );
    } else if (status === "COMPLETED") {
        message = "The work is marked complete. Review it, then close it out.";
        body = (
            <>
                {remaining > 0 && (
                    <p className={`${noticeClass.warning} text-left`}>
                        {remaining} {remaining === 1 ? "item wasn't" : "items weren't"} checked off. Reopen it to send
                        it back, or close it if that&apos;s expected.
                    </p>
                )}
                <Button
                    variant="primary"
                    full
                    pending={pending === "close"}
                    pendingLabel="Closing…"
                    disabled={!!pending}
                    onClick={() => run("close", () => closeWorkOrder(workOrderId), "Work order closed.")}
                >
                    Close work order
                </Button>
                <Button
                    full
                    pending={pending === "reopen"}
                    pendingLabel="Reopening…"
                    disabled={!!pending}
                    onClick={() => run("reopen", () => reopenWorkOrder(workOrderId), "Reopened.")}
                >
                    Reopen
                </Button>
            </>
        );
    } else {
        message =
            status === "CLOSED" ? "Closed. Nothing left to do." : "Cancelled. Reopen it if the work is back on.";
        body = (
            <Button
                full
                pending={pending === "reopen"}
                pendingLabel="Reopening…"
                disabled={!!pending}
                onClick={() => run("reopen", () => reopenWorkOrder(workOrderId), "Reopened.")}
            >
                Reopen
            </Button>
        );
    }

    return (
        // A faint accent edge sets the page's one main action apart from the plain cards around it.
        <section aria-labelledby="next-step-title" className={`${cardClass} border-accent/35`}>
            <div className="p-4 sm:p-5">
                <h2 id="next-step-title" className={cardTitleClass}>
                    {status === "CLOSED" || status === "CANCELLED" || archived ? "Status" : "Next step"}
                </h2>
                <p className="mt-1.5 text-sm leading-relaxed text-secondary">{message}</p>
                {body && <div className="mt-4 flex flex-col gap-2">{body}</div>}
                {error && (
                    <p role="alert" className="mt-3 text-sm text-danger">
                        {error}
                    </p>
                )}
            </div>
            <div className="border-t border-line px-2 py-1.5 sm:px-3">
                <Link
                    href={`/work-orders/${workOrderId}/print`}
                    className={buttonClass({ variant: "ghost", size: "sm", className: "w-full justify-start" })}
                >
                    <PrinterIcon />
                    Print or save as PDF
                </Link>
            </div>
        </section>
    );
}

// "Are you sure?" in place of the buttons, with the confirming action filled.
function ConfirmRow({
    question,
    confirmLabel,
    pending,
    pendingLabel,
    onConfirm,
    onCancel,
}: {
    question: string;
    confirmLabel: string;
    pending: boolean;
    pendingLabel: string;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    return (
        <div role="group" aria-label={question} className="rounded-lg border border-line-strong/70 bg-background/40 p-3">
            <p className="text-sm font-medium text-foreground">{question}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
                <Button onClick={onCancel} disabled={pending}>
                    Go back
                </Button>
                <Button variant="primary" onClick={onConfirm} pending={pending} pendingLabel={pendingLabel} autoFocus>
                    {confirmLabel}
                </Button>
            </div>
        </div>
    );
}

// Cancelling a sent or in-progress work order, from the danger zone. Asks for an optional reason first.
export function CancelWorkOrderButton({
    workOrderId,
    inHouse,
    contractor,
}: {
    workOrderId: string;
    inHouse: boolean;
    contractor: Contractor | null;
}): React.ReactElement {
    const toast = useToast();
    const [confirming, setConfirming] = useState(false);
    const [reason, setReason] = useState("");
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleCancel() {
        setPending(true);
        setError(null);
        try {
            await cancelWorkOrder(workOrderId, reason);
            setReason("");
            setConfirming(false);
            toast("Work order cancelled.");
        } catch {
            setError("Couldn't cancel it. Try again.");
        } finally {
            setPending(false);
        }
    }

    if (!confirming) {
        return (
            // Not red at rest: cancelling can be undone (Reopen), so only the permanent delete is.
            <Button size="sm" onClick={() => setConfirming(true)}>
                Cancel work order
            </Button>
        );
    }

    return (
        <div className="w-full rounded-lg border border-danger/30 bg-danger/5 p-3 sm:w-80">
            <p className="text-sm font-medium text-foreground">Cancel this work order?</p>
            <p className="mt-1 text-sm text-muted">
                {inHouse
                    ? "It stops here and moves to Cancelled."
                    : contractor?.email
                      ? `${contractor.name} will be emailed and their link will stop working.`
                      : "The contractor link will stop working."}
            </p>
            <label className="mt-3 block text-sm font-medium text-secondary">
                Reason <span className="font-normal text-subtle">(optional, shown in the history)</span>
                <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !pending) {
                            e.preventDefault();
                            handleCancel();
                        }
                    }}
                    maxLength={500}
                    disabled={pending}
                    autoFocus
                    className={`${inputClass} mt-1`}
                />
            </label>
            {error && (
                <p role="alert" className="mt-2 text-sm text-danger">
                    {error}
                </p>
            )}
            <div className="mt-3 flex flex-wrap justify-end gap-2">
                <Button
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                        setConfirming(false);
                        setReason("");
                    }}
                >
                    Keep it
                </Button>
                <Button variant="danger" size="sm" onClick={handleCancel} pending={pending} pendingLabel="Cancelling…">
                    Cancel work order
                </Button>
            </div>
        </div>
    );
}
