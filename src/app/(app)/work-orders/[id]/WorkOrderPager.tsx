"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { WorkOrderPagerLinks } from "@/lib/workOrderList";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/Icons";

const button =
    "flex h-9 w-9 items-center justify-center rounded-md border border-line-strong bg-surface text-muted sm:h-8 sm:w-8";

// Previous and next work order in the list this one was opened from: a "‹ 3 of 20 ›" control beside the back link,
// and the ← and → keys (ignored while typing or in a dialog).
export default function WorkOrderPager({ position, total, previousHref, nextHref }: WorkOrderPagerLinks) {
    const router = useRouter();

    useEffect(() => {
        function onKeyDown(event: KeyboardEvent) {
            if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
            const target = event.target as HTMLElement;
            if (
                target.closest("input, textarea, select, [contenteditable]") ||
                document.querySelector("dialog[open]")
            ) {
                return;
            }

            const href = event.key === "ArrowLeft" ? previousHref : event.key === "ArrowRight" ? nextHref : null;
            if (!href) return;
            event.preventDefault();
            router.push(href);
        }

        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [router, previousHref, nextHref]);

    return (
        <nav aria-label="Other work orders in this list" className="flex items-center gap-2 text-sm text-subtle print:hidden">
            <PagerLink href={previousHref} label="Previous work order" shortcut="ArrowLeft">
                <ChevronLeftIcon />
            </PagerLink>
            <span className="tabular-nums">
                {position} of {total}
            </span>
            <PagerLink href={nextHref} label="Next work order" shortcut="ArrowRight">
                <ChevronRightIcon />
            </PagerLink>
        </nav>
    );
}

// A link, or a dimmed placeholder at either end of the list.
function PagerLink({
    href,
    label,
    shortcut,
    children,
}: {
    href: string | null;
    label: string;
    shortcut: string;
    children: React.ReactNode;
}) {
    if (!href) {
        return (
            <span aria-hidden className={`${button} opacity-40`}>
                {children}
            </span>
        );
    }

    return (
        <Link
            href={href}
            aria-label={label}
            title={`${label} (${shortcut === "ArrowLeft" ? "←" : "→"})`}
            aria-keyshortcuts={shortcut}
            className={`${button} hover:border-line-hover hover:text-foreground`}
        >
            {children}
        </Link>
    );
}
