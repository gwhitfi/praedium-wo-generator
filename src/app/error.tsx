"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertIcon } from "@/components/Icons";
import { buttonClass } from "@/lib/ui";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
    useEffect(() => {
        console.error(error);
    }, [error]);

    return (
        <main id="main" className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center text-foreground">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
                <AlertIcon size={22} />
            </div>
            <h1 className="mt-6 text-2xl font-semibold tracking-tight">Something went wrong</h1>
            <p className="mt-3 text-muted">
                That didn&apos;t work, but nothing you saved before is lost. Try again, or go back to the dashboard.
            </p>
            <div className="mt-8 flex flex-col gap-2 sm:flex-row">
                <button type="button" onClick={() => retry()} className={buttonClass({ variant: "primary" })}>
                    Try again
                </button>
                <Link href="/" className={buttonClass()}>
                    Go to the dashboard
                </Link>
            </div>
            {error.digest && <p className="mt-8 text-xs text-subtle">Error ID: {error.digest}</p>}
        </main>
    );
}
