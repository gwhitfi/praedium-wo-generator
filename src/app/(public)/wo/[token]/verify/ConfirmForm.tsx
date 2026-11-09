"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { verifyCode } from "../actions";
import { Button } from "@/components/Button";

// The magic link's confirm step. The code is only checked when the contractor taps Confirm, so a link scanner
// opening the URL never uses it up.
export default function ConfirmForm({
    token,
    challengeId,
    code,
}: {
    token: string;
    challengeId: string;
    code: string;
}): React.ReactElement {
    const router = useRouter();
    const [remember, setRemember] = useState(true);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleConfirm(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setPending(true);
        setError(null);
        try {
            const result = await verifyCode(token, challengeId, code, remember);
            if (result.ok) {
                router.replace(`/wo/${token}`);
                return;
            }
            setError(result.error);
        } catch {
            setError("Couldn't verify. Try again.");
        }
        setPending(false);
    }

    return (
        <form onSubmit={handleConfirm} className="flex flex-col gap-4">
            <label className="flex min-h-10 items-center gap-3 text-sm text-secondary hover:cursor-pointer">
                <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="h-5 w-5 rounded border-line-strong bg-surface accent-accent"
                />
                Remember this device
            </label>
            <div>
                <Button type="submit" variant="primary" size="lg" pending={pending} pendingLabel="Confirming…">
                    Confirm
                </Button>
            </div>
            {error && (
                <p role="alert" className="text-sm text-danger">
                    {error}{" "}
                    <Link href={`/wo/${token}`} className="underline hover:text-foreground">
                        Back to the work order
                    </Link>
                </p>
            )}
        </form>
    );
}
