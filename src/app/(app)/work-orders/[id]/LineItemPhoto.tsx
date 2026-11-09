"use client";

import { useImperativeHandle, useRef, useState } from "react";
import { removeLineItemPhoto, setLineItemPhoto } from "../actions";
import { resizePhoto, UnreadablePhotoError } from "@/lib/resizePhoto";
import { Spinner } from "@/components/Button";

// What the line item's "⋯" menu can ask the photo to do.
export type PhotoHandle = { pick: () => void; remove: () => void };

// A line item's photo: the thumbnail when there is one, plus the upload and removal behind the item's menu
// (Add photo, Replace photo, Remove photo). Shows progress and errors in place.
export default function LineItemPhoto({
    lineItemId,
    description,
    photoId,
    readOnly,
    ref,
}: {
    lineItemId: string;
    description: string;
    photoId: string | null;
    readOnly: boolean;
    ref?: React.Ref<PhotoHandle>;
}): React.ReactElement | null {
    const inputRef = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState<"uploading" | "removing" | null>(null);
    const [error, setError] = useState<string | null>(null);

    async function handleFile(file: File) {
        setBusy("uploading");
        setError(null);
        try {
            const formData = new FormData();
            formData.set("photo", await resizePhoto(file));
            const result = await setLineItemPhoto(lineItemId, formData);
            if (!result.ok) setError(result.error);
        } catch (e) {
            setError(e instanceof UnreadablePhotoError ? e.message : "The photo couldn't be uploaded. Try again.");
        } finally {
            setBusy(null);
            // Lets the same file be picked again after an error.
            if (inputRef.current) inputRef.current.value = "";
        }
    }

    async function handleRemove() {
        setBusy("removing");
        setError(null);
        try {
            const result = await removeLineItemPhoto(lineItemId);
            if (!result.ok) setError(result.error);
        } catch {
            setError("The photo couldn't be removed. Try again.");
        } finally {
            setBusy(null);
        }
    }

    useImperativeHandle(ref, () => ({ pick: () => inputRef.current?.click(), remove: handleRemove }));

    if (readOnly && !photoId) return null;

    return (
        <>
            {!readOnly && (
                <input
                    ref={inputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    tabIndex={-1}
                    aria-hidden
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFile(file);
                    }}
                />
            )}
            {photoId && (
                <a
                    href={`/work-orders/photos/${photoId}`}
                    target="_blank"
                    rel="noopener"
                    className="mt-2 block w-fit"
                    aria-label={`Open the photo for ${description} (new tab)`}
                >
                    {/* next/image would fetch the private route without the user's session. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={`/work-orders/photos/${photoId}`}
                        alt={`Photo for ${description}`}
                        loading="lazy"
                        className="h-20 w-20 rounded-md border border-line-strong object-cover hover:border-line-hover"
                    />
                </a>
            )}
            {busy && (
                <p role="status" className="mt-2 flex items-center gap-2 text-[0.8125rem] text-muted">
                    <Spinner className="h-3.5 w-3.5" />
                    {busy === "uploading" ? "Uploading photo…" : "Removing photo…"}
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
