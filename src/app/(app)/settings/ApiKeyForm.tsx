"use client";

import { useActionState, useState } from "react";
import { createApiKey } from "./actions";
import { inputClass, labelClass } from "@/lib/defaults";

// The full key comes back only from the create that made it, so it's shown here once and never again.
export default function ApiKeyForm(): React.ReactElement {
    const [state, formAction, pending] = useActionState(createApiKey, {});
    const [copied, setCopied] = useState<string | null>(null);
    const newKey = state.key;

    async function copy(key: string) {
        try {
            await navigator.clipboard.writeText(key);
            setCopied(key);
        } catch {
            setCopied(null);
        }
    }

    return (
        <form action={formAction} noValidate className="border-t border-line bg-background/40 px-5 py-4 sm:px-6">
            {newKey && (
                <div className="mb-4 rounded-md border border-success/40 bg-success/10 p-3 text-sm">
                    <p className="font-medium text-success">Key &ldquo;{state.name}&rdquo; created.</p>
                    <p className="mt-1 text-muted">Copy it now. You won&apos;t be able to see it again.</p>
                    <div className="mt-2 flex gap-2">
                        <input
                            readOnly
                            value={newKey}
                            aria-label="New API key"
                            onFocus={(e) => e.target.select()}
                            className={`${inputClass} font-mono`}
                        />
                        <button
                            type="button"
                            onClick={() => copy(newKey)}
                            className="shrink-0 rounded-md border border-line-strong px-3 py-2 text-sm text-foreground hover:bg-surface-hover hover:cursor-pointer"
                        >
                            {copied === newKey ? "Copied" : "Copy"}
                        </button>
                    </div>
                </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <label className={`${labelClass} flex-1`}>
                    New key name
                    <input
                        name="name"
                        defaultValue={newKey ? "" : (state.name ?? "")}
                        placeholder="e.g. Claude on my laptop"
                        maxLength={60}
                        className={inputClass}
                    />
                </label>
                <button
                    type="submit"
                    disabled={pending}
                    className="shrink-0 rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover hover:cursor-pointer disabled:opacity-40"
                >
                    {pending ? "Creating..." : "Create key"}
                </button>
            </div>
            {state.errors?.name && <p className="mt-1 text-sm text-danger">{state.errors.name[0]}</p>}
            {state.error && (
                <p className="mt-1 text-sm text-danger" role="status">
                    {state.error}
                </p>
            )}
        </form>
    );
}
