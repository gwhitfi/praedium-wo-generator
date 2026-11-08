"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { regeneratePublicToken } from "../actions";
import { inputClass } from "@/lib/defaults";

const noopSubscribe = () => () => {};
const getOrigin = () => window.location.origin;
const getServerOrigin = () => "";

const buttonClass =
    "shrink-0 rounded-md border border-line-strong px-4 py-2 text-sm text-foreground hover:bg-surface-hover hover:cursor-pointer disabled:opacity-40 disabled:hover:cursor-not-allowed";

export default function ContractorLink({
    workOrderId,
    token,
    status,
}: {
    workOrderId: string;
    token: string;
    status: string;
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    const origin = useSyncExternalStore(noopSubscribe, getOrigin, getServerOrigin);
    const [copied, setCopied] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (status === "DRAFT") {
        return (
            <p className="text-sm text-subtle">
                The contractor link becomes active once this work order is marked as sent.
            </p>
        );
    }

    const path = `/wo/${token}`;
    const url = `${origin}${path}`;

    async function handleCopy() {
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            inputRef.current?.select();
        }
    }

    async function handleRegenerate() {
        setPending(true);
        try {
            await regeneratePublicToken(workOrderId);
            setError(null);
        } catch {
            setError("Could not regenerate the link. Try again.");
        } finally {
            setPending(false);
            setConfirming(false);
        }
    }

    return (
        <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-2 sm:flex-row">
                <input
                    ref={inputRef}
                    readOnly
                    value={url}
                    onFocus={(e) => e.target.select()}
                    aria-label="Contractor link"
                    className={`${inputClass} font-mono text-xs`}
                />
                <div className="flex gap-2">
                    <button type="button" onClick={handleCopy} disabled={!origin} className={buttonClass}>
                        {copied ? "Copied ✓" : "Copy"}
                    </button>
                    <a href={path} target="_blank" rel="noopener noreferrer" className={buttonClass}>
                        Open
                    </a>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm">
                {confirming ? (
                    <>
                        <span className="text-secondary">The old link will stop working. Continue?</span>
                        <button
                            type="button"
                            onClick={handleRegenerate}
                            disabled={pending}
                            className="text-danger hover:text-danger/80 hover:cursor-pointer disabled:opacity-40"
                        >
                            {pending ? "Regenerating..." : "Yes, regenerate"}
                        </button>
                        <button
                            type="button"
                            onClick={() => setConfirming(false)}
                            disabled={pending}
                            className="text-subtle hover:text-foreground hover:cursor-pointer"
                        >
                            Go back
                        </button>
                    </>
                ) : (
                    <button
                        type="button"
                        onClick={() => setConfirming(true)}
                        className="text-subtle hover:text-foreground hover:cursor-pointer"
                    >
                        Regenerate link
                    </button>
                )}
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}
        </div>
    );
}
