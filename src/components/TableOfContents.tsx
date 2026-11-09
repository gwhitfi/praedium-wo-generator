"use client";

import { useSyncExternalStore } from "react";

type Heading = { id: string; text: string };

// The page's section headings, read once from the page in the browser.
let cache: { key: string; headings: Heading[] } | null = null;
function readHeadings(): Heading[] {
    const nodes = Array.from(document.querySelectorAll<HTMLHeadingElement>("main h2[id]"));
    const key = nodes.map((node) => node.id).join("|");
    if (cache?.key !== key) {
        // Without a leading "4. ", so the Terms and Privacy lists look the same.
        cache = {
            key,
            headings: nodes.map((node) => ({ id: node.id, text: (node.textContent ?? "").replace(/^\d+\.\s*/, "") })),
        };
    }
    return cache.headings;
}
const noHeadings: Heading[] = [];

// "On this page": links to each section of a long document (Terms, Privacy), built from its h2 headings.
export default function TableOfContents(): React.ReactElement | null {
    const headings = useSyncExternalStore(
        () => () => {},
        readHeadings,
        () => noHeadings,
    );
    if (headings.length < 3) return null;

    return (
        <nav aria-label="On this page" className="mt-6 rounded-xl border border-line bg-surface p-4 sm:p-5">
            <p className="text-sm font-semibold text-foreground">On this page</p>
            <ol className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {headings.map((heading) => (
                    <li key={heading.id}>
                        <a
                            href={`#${heading.id}`}
                            className="inline-block py-1 text-muted hover:text-foreground hover:underline"
                        >
                            {heading.text}
                        </a>
                    </li>
                ))}
            </ol>
        </nav>
    );
}
