"use client";

import { useEffect, useRef } from "react";
import { ChevronDownIcon } from "@/components/Icons";

export type SectionLink = { id: string; label: string; count: number };

// Phones only: one compact "Jump to" menu above a list split into sections, so a long list's later sections are a
// tap away without a row of chips. A native <details>, like the phone Sort menu.
export function SectionMenu({ sections }: { sections: SectionLink[] }): React.ReactElement | null {
    if (sections.length < 3) return null;
    return (
        <details className="group relative mb-4 w-fit md:hidden">
            <summary className="flex h-10 cursor-pointer list-none items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-sm text-muted hover:text-foreground [&::-webkit-details-marker]:hidden">
                Jump to section
                <ChevronDownIcon size={14} className="transition-transform group-open:rotate-180" />
            </summary>
            <ul className="absolute left-0 top-full z-20 mt-1 min-w-52 rounded-lg border border-line bg-surface py-1 shadow-lg">
                {sections.map((section) => (
                    <li key={section.id}>
                        <a
                            href={`#${section.id}`}
                            onClick={(event) => event.currentTarget.closest("details")?.removeAttribute("open")}
                            className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm text-secondary hover:bg-surface-hover hover:text-foreground"
                        >
                            {section.label}
                            <span className="tabular-nums text-subtle">{section.count}</span>
                        </a>
                    </li>
                ))}
            </ul>
        </details>
    );
}

const STORAGE_PREFIX = "praedium:section:";

// One section of a split list that can be folded away: the heading (with its count) opens and closes it. Whether it's
// open is remembered in this browser per section id; `defaultOpen` is the starting point (closed for history such as
// Closed work orders). Jumping to it with a "#id" link opens it.
export function CollapsibleSection({
    id,
    title,
    count,
    dot,
    defaultOpen = true,
    children,
}: {
    id: string;
    title: string;
    count: number;
    dot?: string;
    defaultOpen?: boolean;
    children: React.ReactNode;
}): React.ReactElement {
    const ref = useRef<HTMLDetailsElement>(null);

    useEffect(() => {
        const details = ref.current;
        if (!details) return;
        try {
            const saved = localStorage.getItem(STORAGE_PREFIX + id);
            if (saved !== null) details.open = saved === "1";
        } catch {
            // Storage blocked: keep the default.
        }
        function openIfTarget() {
            if (details && window.location.hash === `#${id}`) details.open = true;
        }
        openIfTarget();
        window.addEventListener("hashchange", openIfTarget);
        return () => window.removeEventListener("hashchange", openIfTarget);
    }, [id]);

    return (
        <details
            ref={ref}
            id={id}
            open={defaultOpen}
            onToggle={(event) => {
                try {
                    localStorage.setItem(STORAGE_PREFIX + id, event.currentTarget.open ? "1" : "0");
                } catch {
                    // Storage blocked: it just won't be remembered.
                }
            }}
            className="group/section scroll-mt-2"
        >
            <summary className="mb-2 flex min-h-10 w-fit cursor-pointer list-none items-center gap-2 rounded-md pr-2 [&::-webkit-details-marker]:hidden">
                <ChevronDownIcon
                    size={16}
                    className="-rotate-90 text-subtle transition-transform group-open/section:rotate-0"
                />
                <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
                    {dot && <span aria-hidden className={`h-2 w-2 rounded-full ${dot}`} />}
                    {title}
                    <span className="text-sm font-normal text-subtle">{count}</span>
                </h2>
            </summary>
            {children}
        </details>
    );
}
