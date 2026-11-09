"use client";

import { useActionState, useState } from "react";
import { createApiKey } from "./actions";
import { inputClass, labelClass } from "@/lib/defaults";
import { Button } from "@/components/Button";

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
                        <Button onClick={() => copy(newKey)}>{copied === newKey ? "Copied" : "Copy"}</Button>
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
                <Button type="submit" variant="primary" pending={pending} pendingLabel="Creating…">
                    Create key
                </Button>
            </div>
            {state.errors?.name && (
                <p role="alert" className="mt-1 text-sm text-danger">
                    {state.errors.name[0]}
                </p>
            )}
            <label className="mt-3 flex items-start gap-3 text-sm text-foreground hover:cursor-pointer">
                <input name="canChangeStatus" type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-accent" />
                <span>
                    Allow this key to send, cancel, archive and restore work orders
                    <span className="block text-[0.8125rem] text-muted">
                        These email contractors, and sometimes tenants. To change this later, revoke the key and create
                        a new one.
                    </span>
                </span>
            </label>
            {state.error && (
                <p className="mt-1 text-sm text-danger" role="status">
                    {state.error}
                </p>
            )}
        </form>
    );
}
