"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { sendCode, verifyCode } from "./actions";
import { inputClass } from "@/lib/defaults";

const accentButton =
    "shrink-0 rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover hover:cursor-pointer disabled:opacity-40";

// Shown at the top of the contractor page until the browser is verified: sends a code to the contractor email on
// file, then checks it. On success the server sets the session cookie and the page reloads in full.
export default function VerifyBox({
    token,
    emailHint,
    actions = { sendCode, verifyCode },
}: {
    token: string;
    emailHint: string;
    actions?: {
        sendCode: typeof sendCode;
        verifyCode: typeof verifyCode;
    };
}): React.ReactElement {
    const router = useRouter();
    const [challengeId, setChallengeId] = useState<string | null>(null);
    const [code, setCode] = useState("");
    const [remember, setRemember] = useState(true);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSend() {
        setPending(true);
        setError(null);
        try {
            const result = await actions.sendCode(token);
            if (result.ok) {
                setChallengeId(result.challengeId);
                setCode("");
            } else {
                setError(result.error);
            }
        } catch {
            setError("Couldn't send the code. Try again.");
        } finally {
            setPending(false);
        }
    }

    async function handleVerify(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!challengeId) return;
        setPending(true);
        setError(null);
        try {
            const result = await actions.verifyCode(token, challengeId, code, remember);
            if (result.ok) {
                router.refresh();
                return;
            }
            setError(result.error);
        } catch {
            setError("Couldn't check the code. Try again.");
        }
        setPending(false);
    }

    return (
        <div className="mb-5 rounded-lg border border-accent/40 bg-accent/10 p-4 print:hidden">
            {challengeId ? (
                <form onSubmit={handleVerify} className="flex flex-col gap-3">
                    <label htmlFor="verify-code" className="text-sm text-foreground">
                        We emailed a code to <span className="font-medium">{emailHint}</span>. Enter it here:
                    </label>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <input
                            id="verify-code"
                            name="code"
                            type="text"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={6}
                            pattern="\d{6}"
                            required
                            value={code}
                            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                            aria-invalid={error ? true : undefined}
                            aria-describedby={error ? "verify-error" : undefined}
                            className={`${inputClass} font-mono tracking-widest sm:w-40`}
                        />
                        <button type="submit" disabled={pending || code.length !== 6} className={accentButton}>
                            {pending ? "Checking..." : "Verify"}
                        </button>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="flex items-center gap-2 text-sm text-secondary">
                            <input
                                type="checkbox"
                                checked={remember}
                                onChange={(e) => setRemember(e.target.checked)}
                                className="h-4 w-4 rounded border-line-strong bg-surface"
                            />
                            Remember this device
                        </label>
                        <button
                            type="button"
                            onClick={handleSend}
                            disabled={pending}
                            className="text-sm text-subtle underline hover:text-foreground hover:cursor-pointer disabled:opacity-40"
                        >
                            Send a new code
                        </button>
                    </div>
                </form>
            ) : (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-foreground">
                        Verify it&apos;s you to see tenant details, photos and notes and to check off work. We&apos;ll
                        send a code to <span className="font-medium">{emailHint}</span>.
                    </p>
                    <button type="button" onClick={handleSend} disabled={pending} className={accentButton}>
                        {pending ? "Sending..." : "Send code"}
                    </button>
                </div>
            )}
            {error && (
                <p id="verify-error" role="alert" className="mt-2 text-sm text-danger">
                    {error}
                </p>
            )}
        </div>
    );
}
