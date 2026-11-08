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

export default function StatusActions({
    workOrderId,
    status,
    inHouse,
    hasContractor,
    contractor,
}: {
    workOrderId: string;
    status: string;
    // Handled by the office: started instead of sent, with no contractor emails.
    inHouse: boolean;
    hasContractor: boolean;
    contractor: { id: string; name: string; email: string | null } | null;
}) {
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [confirmingEmail, setConfirmingEmail] = useState(false);
    const [confirmingCancel, setConfirmingCancel] = useState(false);
    const [cancelReason, setCancelReason] = useState("");
    const [sentTo, setSentTo] = useState<string | null>(null);

    async function handleEmail() {
        setPending(true);
        setError(null);
        setSentTo(null);
        try {
            const res = await emailWorkOrder(workOrderId);
            if (res.ok) setSentTo(res.to);
            else setError(res.error);
        } catch {
            setError("Something went wrong. Try again.");
        } finally {
            setPending(false);
            setConfirmingEmail(false);
        }
    }

    const canEmail = !!contractor?.email;
    const emailControls = confirmingEmail ? (
        <>
            <span className="text-sm text-secondary">Email this work order to {contractor?.email}?</span>
            <button
                className="shrink-0 rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover hover:cursor-pointer disabled:opacity-40"
                onClick={handleEmail}
                disabled={pending}
            >
                {pending ? "Sending..." : "Send"}
            </button>
            <button
                className="shrink-0 px-2 text-sm text-subtle hover:text-foreground hover:cursor-pointer"
                onClick={() => setConfirmingEmail(false)}
                disabled={pending}
            >
                Go back
            </button>
        </>
    ) : (
        <button
            className={
                status === "DRAFT"
                    ? "shrink-0 rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover hover:cursor-pointer disabled:opacity-40 disabled:hover:cursor-not-allowed"
                    : "shrink-0 rounded-md border border-line-strong px-4 py-2 text-sm text-foreground hover:bg-surface-hover hover:cursor-pointer disabled:opacity-40 disabled:hover:cursor-not-allowed"
            }
            onClick={() => {
                setSentTo(null);
                setConfirmingEmail(true);
            }}
            disabled={pending || !canEmail}
        >
            {status === "DRAFT" ? "Send by email" : "Resend email"}
        </button>
    );

    const missingEmailHint = contractor && !contractor.email && (
        <span className="text-sm text-subtle">
            <Link href={`/contacts/${contractor.id}`} className="underline hover:text-foreground">
                Add an email to {contractor.name}
            </Link>{" "}
            to send by email.
        </span>
    );

    function handleCancel() {
        run(async () => {
            await cancelWorkOrder(workOrderId, cancelReason);
            setCancelReason("");
        });
    }

    async function run(fn: () => Promise<void>) {
        setPending(true);
        setError(null);
        try {
            await fn();
        } catch {
            setError("Something went wrong. Try again.");
        } finally {
            setPending(false);
            setConfirmingCancel(false);
        }
    }

    function handleStart() {
        run(async () => {
            const res = await startWorkOrder(workOrderId);
            if (!res.ok) throw new Error(res.error);
        });
    }

    return (
        <div className="flex flex-wrap items-center gap-2">
            {status === "DRAFT" && inHouse && (
                <>
                    <button
                        className="shrink-0 rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover hover:cursor-pointer disabled:opacity-40 disabled:hover:cursor-not-allowed"
                        onClick={handleStart}
                        disabled={pending}
                    >
                        Start work
                    </button>
                    <span className="text-sm text-subtle">In-house: nothing is sent to a contractor.</span>
                </>
            )}
            {status === "DRAFT" && !inHouse && (
                <>
                    {hasContractor && emailControls}
                    <button
                        className="shrink-0 rounded-md border border-line-strong px-4 py-2 text-sm text-foreground hover:bg-surface-hover hover:cursor-pointer disabled:opacity-40 disabled:hover:cursor-not-allowed"
                        onClick={() => run(() => sendWorkOrder(workOrderId, "PRINT" as DeliveryMethod))}
                        disabled={pending || !hasContractor}
                    >
                        Mark as sent
                    </button>
                    {!hasContractor && <span className="text-sm text-subtle">Assign a contractor to send.</span>}
                    {missingEmailHint}
                </>
            )}
            {(status === "SENT" || status === "IN_PROGRESS") && (
                <>
                    {!inHouse && emailControls}
                    <button
                        className="shrink-0 rounded-md border border-line-strong px-4 py-2 text-sm text-foreground hover:bg-surface-hover hover:cursor-pointer disabled:opacity-40 disabled:hover:cursor-not-allowed"
                        onClick={() => run(() => markWorkOrderCompleted(workOrderId))}
                        disabled={pending}
                    >
                        Mark as completed
                    </button>
                    {confirmingCancel ? (
                        <span className="flex flex-wrap items-center gap-2 text-sm">
                            <span className="text-secondary">
                                Cancel this work order?{" "}
                                {inHouse
                                    ? ""
                                    : contractor?.email
                                      ? `${contractor.name} will be emailed and their link will stop working.`
                                      : "The contractor link will stop working."}
                            </span>
                            <input
                                type="text"
                                value={cancelReason}
                                onChange={(e) => setCancelReason(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !pending) {
                                        e.preventDefault();
                                        handleCancel();
                                    }
                                }}
                                placeholder="Reason (optional)"
                                aria-label="Reason for cancelling"
                                maxLength={500}
                                disabled={pending}
                                className="min-w-48 flex-1 rounded border border-faint bg-surface-hover px-2 py-0.5 text-base text-foreground focus:outline-none"
                            />
                            <button
                                className="text-danger hover:text-danger/80 hover:cursor-pointer disabled:opacity-40"
                                onClick={handleCancel}
                                disabled={pending}
                            >
                                {pending ? "Cancelling..." : "Yes, cancel it"}
                            </button>
                            <button
                                className="text-subtle hover:text-foreground hover:cursor-pointer"
                                onClick={() => {
                                    setConfirmingCancel(false);
                                    setCancelReason("");
                                }}
                                disabled={pending}
                            >
                                Keep it
                            </button>
                        </span>
                    ) : (
                        <button
                            className="shrink-0 rounded-md border border-line-strong px-4 py-2 text-sm text-foreground hover:bg-surface-hover hover:cursor-pointer disabled:opacity-40 disabled:hover:cursor-not-allowed"
                            onClick={() => setConfirmingCancel(true)}
                            disabled={pending}
                        >
                            Cancel work order
                        </button>
                    )}
                </>
            )}
            {status === "COMPLETED" && (
                <>
                    <button
                        className="shrink-0 rounded-md border border-line-strong px-4 py-2 text-sm text-foreground hover:bg-surface-hover hover:cursor-pointer disabled:opacity-40 disabled:hover:cursor-not-allowed"
                        onClick={() => run(() => closeWorkOrder(workOrderId))}
                        disabled={pending}
                    >
                        Close
                    </button>
                    <button
                        className="shrink-0 rounded-md border border-line-strong px-4 py-2 text-sm text-foreground hover:bg-surface-hover hover:cursor-pointer disabled:opacity-40 disabled:hover:cursor-not-allowed"
                        onClick={() => run(() => reopenWorkOrder(workOrderId))}
                        disabled={pending}
                    >
                        Reopen
                    </button>
                </>
            )}
            {(status === "CLOSED" || status === "CANCELLED") && (
                <button
                    className="shrink-0 rounded-md border border-line-strong px-4 py-2 text-sm text-foreground hover:bg-surface-hover hover:cursor-pointer disabled:opacity-40 disabled:hover:cursor-not-allowed"
                    onClick={() => run(() => reopenWorkOrder(workOrderId))}
                    disabled={pending}
                >
                    Reopen
                </button>
            )}
            {(status === "SENT" || status === "IN_PROGRESS") && !inHouse && missingEmailHint}
            {sentTo && <p className="w-full text-sm text-success">Sent to {sentTo}.</p>}
            {error && <p className="w-full text-sm text-danger">{error}</p>}
        </div>
    );
}
