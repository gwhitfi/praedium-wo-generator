import Link from "next/link";
import React from "react";
import type { SortLabel } from "@/lib/sorting";

// `tint` is a background class that replaces the default surface color, such as a status color.
export function List({ tint, children }: { tint?: string; children: React.ReactNode }) {
    return (
        <ul className={`divide-y divide-line overflow-hidden rounded-lg border border-line ${tint ?? "bg-surface/40"}`}>
            {children}
        </ul>
    );
}

// `tint` replaces the header's surface color, like List's.
export function ListHeader({
    cols,
    labels,
    tint,
}: {
    cols: string;
    labels: (string | SortLabel)[];
    tint?: string;
}) {
    const sortable = labels.some((label) => typeof label !== "string");

    return (
        <li
            aria-hidden={sortable ? undefined : true}
            className={`hidden gap-4 px-4 py-2 text-xs uppercase tracking-wide text-subtle sm:grid ${tint ?? "bg-surface"} ${cols}`}
        >
            {labels.map((label, i) =>
                typeof label === "string" ? (
                    <span key={i}>{label}</span>
                ) : (
                    <Link
                        key={i}
                        href={label.href}
                        className={`flex min-w-0 items-center gap-1 hover:text-foreground ${label.sorted ? "text-foreground" : ""}`}
                    >
                        <span className="truncate">{label.label}</span>
                        {label.sorted && (
                            <>
                                <span aria-hidden>{label.sorted === "asc" ? "▲" : "▼"}</span>
                                <span className="sr-only">
                                    , sorted {label.sorted === "asc" ? "ascending" : "descending"}
                                </span>
                            </>
                        )}
                    </Link>
                ),
            )}
        </li>
    );
}

export function ListRow({
    href,
    label,
    cols,
    children,
}: {
    href: string;
    label: string;
    cols: string;
    children: React.ReactNode;
}) {
    return (
        <li className="relative transition-colors hover:bg-surface-hover/40">
            <div
                className={`flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-3 text-sm sm:grid sm:items-center sm:gap-4 ${cols}`}
            >
                {children}
            </div>
            <Link
                href={href}
                aria-label={label}
                className="absolute inset-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
            />
        </li>
    );
}

export function Cell({ className = "", children }: { className?: string; children?: React.ReactNode }) {
    return <div className={`min-w-0 empty:hidden sm:empty:block ${className}`}>{children}</div>;
}

export function ListLink({ href, children }: { href: string; children: React.ReactNode }) {
    return (
        <a href={href} className="relative z-10 block truncate hover:text-foreground hover:underline">
            {children}
        </a>
    );
}

export function Favorite({ show }: { show: boolean }) {
    if (!show) return null;
    return (
        <span className="ml-1.5 text-warning" aria-label="Favorite">
            ★
        </span>
    );
}
