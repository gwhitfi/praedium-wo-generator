"use client";

import { useState, useSyncExternalStore } from "react";
import { regeneratePublicToken } from "../statusActions";
import { Button } from "@/components/Button";
import { useToast } from "@/components/Toaster";
import { CopyIcon, ExternalIcon, LinkIcon, RotateIcon } from "@/components/Icons";
import { buttonClass, cardClass, cardTitleClass } from "@/lib/ui";

const noopSubscribe = () => () => {};
const getOrigin = () => window.location.origin;
const getServerOrigin = () => "";

// "…/wo/OUFDh3…ZcBb": enough of the link to recognize it, short enough for a phone.
function shortLink(token: string): string {
    return `/wo/${token.slice(0, 6)}…${token.slice(-4)}`;
}

// The contractor's link in a card: copy it, open it, or replace it with a new one.
export default function ContractorLink({
    workOrderId,
    token,
    status,
}: {
    workOrderId: string;
    token: string;
    status: string;
}): React.ReactElement {
    const toast = useToast();
    const origin = useSyncExternalStore(noopSubscribe, getOrigin, getServerOrigin);
    const [confirming, setConfirming] = useState(false);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const finished = status === "COMPLETED" || status === "CLOSED";
    const path = `/wo/${token}`;
    const url = `${origin}${path}`;

    async function handleCopy() {
        try {
            await navigator.clipboard.writeText(url);
            toast("Link copied.");
        } catch {
            toast(`Couldn't copy. The link is ${url}`, "error");
        }
    }

    async function handleRegenerate() {
        setPending(true);
        try {
            const res = await regeneratePublicToken(workOrderId);
            if (!res.ok) {
                setError(res.error);
                return;
            }
            setError(null);
            setConfirming(false);
            toast("New link created. The old one no longer works.");
        } catch {
            setError("Couldn't create a new link. Try again.");
        } finally {
            setPending(false);
        }
    }

    return (
        <section
            id="contractor-link"
            aria-labelledby="contractor-link-title"
            className={`${cardClass} scroll-mt-32 p-4 sm:p-5`}
        >
            <h2 id="contractor-link-title" className={`${cardTitleClass} flex items-center gap-1.5`}>
                <LinkIcon size={13} />
                Contractor link
            </h2>
            {status === "DRAFT" ? (
                <p className="mt-1.5 text-sm text-muted">The link goes live when you send the work order.</p>
            ) : (
                <>
                    <p className="mt-1.5 truncate text-sm text-secondary" title={url || path}>
                        {origin ? origin.replace(/^https?:\/\//, "") : ""}
                        {shortLink(token)}
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                        <Button size="sm" onClick={handleCopy} disabled={!origin}>
                            <CopyIcon />
                            Copy link
                        </Button>
                        <a
                            href={path}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={buttonClass({ size: "sm" })}
                        >
                            <ExternalIcon />
                            Open
                            <span className="sr-only">(opens in a new tab)</span>
                        </a>
                    </div>
                    {finished ? (
                        // Finished work: the contractor's page shows only a summary, so there's nothing to replace.
                        <p className="mt-2.5 text-[0.8125rem] text-muted">
                            The work is finished, so the link now shows a summary only.
                        </p>
                    ) : confirming ? (
                        <div className="mt-3 rounded-lg border border-line-strong/70 bg-background/40 p-3">
                            <p className="text-sm text-foreground">
                                Create a new link? The old one stops working right away.
                            </p>
                            <div className="mt-2 flex justify-end gap-2">
                                <Button size="sm" onClick={() => setConfirming(false)} disabled={pending}>
                                    Go back
                                </Button>
                                <Button
                                    size="sm"
                                    variant="danger"
                                    onClick={handleRegenerate}
                                    pending={pending}
                                    pendingLabel="Creating…"
                                >
                                    New link
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setConfirming(true)}
                            className="mt-2 w-full"
                        >
                            <RotateIcon size={14} />
                            Replace with a new link…
                        </Button>
                    )}
                    {error && (
                        <p role="alert" className="mt-2 text-sm text-danger">
                            {error}
                        </p>
                    )}
                </>
            )}
        </section>
    );
}
