"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import "./globals.css";

// Shown only when the root layout itself fails, so it brings its own <html> and <body> and can't use the layout's
// fonts, theme script or components. src/app/error.tsx handles everything else.
export default function GlobalError({ error }: { error: Error & { digest?: string } }): React.ReactElement {
    useEffect(() => {
        console.error(error);
        // An error with a digest came from the server, which already reported it (src/instrumentation.ts).
        if (!error.digest) Sentry.captureException(error);
    }, [error]);

    return (
        <html lang="en">
            <body className="min-h-full bg-background text-foreground">
                <main id="main" className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
                    <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
                    <p className="mt-3 text-muted">Praedium couldn&apos;t load. Reload the page to try again.</p>
                    {/* A plain link, not next/link: the root layout failed, so a full reload is what's needed. */}
                    {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                    <a href="/" className="mt-8 text-sm font-medium text-accent hover:underline">
                        Go to the dashboard
                    </a>
                    {error.digest && <p className="mt-8 text-xs text-subtle">Error ID: {error.digest}</p>}
                </main>
            </body>
        </html>
    );
}
