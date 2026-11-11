"use client";

import { useImperativeHandle, useRef, useState } from "react";
import { addLineItemPhoto, removeLineItemPhoto } from "../photoActions";
import { resizePhoto, UnreadablePhotoError } from "@/lib/resizePhoto";
import { MAX_LINE_ITEM_PHOTOS } from "@/lib/photos";
import { Spinner } from "@/components/Button";
import { XIcon } from "@/components/Icons";

// What the line item's "⋯" menu can ask the photos to do.
export type PhotoHandle = { pick: () => void };

type Busy = { kind: "uploading"; current: number; total: number } | { kind: "removing" };

// A line item's photos (up to MAX_LINE_ITEM_PHOTOS): the thumbnails, each with a remove button while the item can
// be edited, plus the upload behind the item's "Add photo" menu entry. Shows progress and errors in place.
export default function LineItemPhoto({
    lineItemId,
    description,
    photoIds,
    readOnly,
    ref,
}: {
    lineItemId: string;
    description: string;
    photoIds: string[];
    readOnly: boolean;
    ref?: React.Ref<PhotoHandle>;
}): React.ReactElement | null {
    const inputRef = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState<Busy | null>(null);
    const [error, setError] = useState<string | null>(null);

    async function handleFiles(picked: File[]) {
        const free = MAX_LINE_ITEM_PHOTOS - photoIds.length;
        const files = picked.slice(0, Math.max(free, 0));
        const skipped = picked.length - files.length;
        const skippedNote =
            skipped > 0
                ? `A line item can have up to ${MAX_LINE_ITEM_PHOTOS} photos, so ${skipped} ${skipped === 1 ? "wasn't" : "weren't"} added.`
                : null;
        setError(null);
        try {
            for (const [i, file] of files.entries()) {
                setBusy({ kind: "uploading", current: i + 1, total: files.length });
                const formData = new FormData();
                formData.set("photo", await resizePhoto(file));
                const result = await addLineItemPhoto(lineItemId, formData);
                if (!result.ok) {
                    setError(result.error);
                    return;
                }
            }
            setError(skippedNote);
        } catch (e) {
            setError(e instanceof UnreadablePhotoError ? e.message : "The photo couldn't be uploaded. Try again.");
        } finally {
            setBusy(null);
            // Lets the same file be picked again after an error.
            if (inputRef.current) inputRef.current.value = "";
        }
    }

    async function handleRemove(photoId: string) {
        setBusy({ kind: "removing" });
        setError(null);
        try {
            const result = await removeLineItemPhoto(photoId);
            if (!result.ok) setError(result.error);
        } catch {
            setError("The photo couldn't be removed. Try again.");
        } finally {
            setBusy(null);
        }
    }

    useImperativeHandle(ref, () => ({ pick: () => inputRef.current?.click() }));

    if (readOnly && photoIds.length === 0) return null;

    return (
        <>
            {!readOnly && (
                <input
                    ref={inputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    tabIndex={-1}
                    aria-hidden
                    onChange={(e) => {
                        const files = Array.from(e.target.files ?? []);
                        if (files.length > 0) handleFiles(files);
                    }}
                />
            )}
            {photoIds.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-2" aria-label={`Photos for ${description}`}>
                    {photoIds.map((photoId, i) => {
                        const label = photoIds.length === 1 ? "the photo" : `photo ${i + 1}`;
                        return (
                            <li key={photoId} className="relative">
                                <a
                                    href={`/work-orders/photos/${photoId}`}
                                    target="_blank"
                                    rel="noopener"
                                    className="block w-fit"
                                    aria-label={`Open ${label} for ${description} (new tab)`}
                                >
                                    {/* next/image would fetch the private route without the user's session. */}
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={`/work-orders/photos/${photoId}`}
                                        alt={`Photo ${i + 1} for ${description}`}
                                        loading="lazy"
                                        className="h-20 w-20 rounded-md border border-line-strong object-cover hover:border-line-hover"
                                    />
                                </a>
                                {!readOnly && (
                                    <button
                                        type="button"
                                        onClick={() => handleRemove(photoId)}
                                        disabled={busy !== null}
                                        aria-label={`Remove ${label} for ${description}`}
                                        className="absolute -top-2 -right-2 inline-flex h-7 w-7 items-center justify-center rounded-full border border-line-strong bg-surface text-muted shadow-sm transition-colors hover:cursor-pointer hover:border-danger/40 hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                        <XIcon size={14} />
                                    </button>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
            {busy && (
                <p role="status" className="mt-2 flex items-center gap-2 text-[0.8125rem] text-muted">
                    <Spinner className="h-3.5 w-3.5" />
                    {busy.kind === "removing"
                        ? "Removing photo…"
                        : busy.total > 1
                          ? `Uploading photo ${busy.current} of ${busy.total}…`
                          : "Uploading photo…"}
                </p>
            )}
            {error && (
                <p role="alert" className="mt-2 text-sm text-danger">
                    {error}
                </p>
            )}
        </>
    );
}
