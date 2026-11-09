import Link from "next/link";
import React from "react";
import type { SortLabel } from "@/lib/sorting";

// The list pages' tables. With room (the list itself at least 44rem wide) they're grids with a header row; narrower,
// as on phones or in a page's side-by-side column, each row becomes a stacked card and the header is visually hidden
// (screen readers still get it). Cells switch with the `list-wide:` and `list-narrow:` variants from globals.css,
// which measure the list, not the window. They use ARIA table roles, so screen readers announce the column name with
// each value. Each row's main cell holds a RowLink, stretched over the whole row, so the row is clickable without an
// extra cell.

// The `cols` class for lists that pass `columns` to List.
export const ROW_COLS = "list-wide:grid-cols-(--row-cols)";

// `tint` is a background class that replaces the default surface color, such as a status color.
// `label` names the table for screen readers ("Contractors", "Drafts").
// `columns` is a grid-template-columns value for the table layout, used by rows and the header through `cols` =
// ROW_COLS; lists can also pass a literal `list-wide:grid-cols-[...]` class instead.
export function List({
    tint,
    label,
    columns,
    children,
}: {
    tint?: string;
    label?: string;
    columns?: string;
    children: React.ReactNode;
}): React.ReactElement {
    return (
        <div
            role="table"
            aria-label={label}
            style={columns ? ({ "--row-cols": columns } as React.CSSProperties) : undefined}
            className={`@container/list divide-y divide-line overflow-hidden rounded-xl border border-line shadow-[0_1px_2px_rgb(0_0_0/0.05)] ${tint ?? "bg-surface"}`}
        >
            {children}
        </div>
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
}): React.ReactElement {
    return (
        <div
            role="row"
            className={`sr-only gap-4 text-xs font-medium uppercase tracking-wide text-subtle list-wide:not-sr-only list-wide:grid list-wide:px-4! list-wide:py-2.5! ${tint ?? "bg-surface-hover/50"} ${cols}`}
        >
            {labels.map((label, i) =>
                typeof label === "string" ? (
                    <span key={i} role="columnheader">
                        {label}
                    </span>
                ) : (
                    <span
                        key={i}
                        role="columnheader"
                        aria-sort={
                            label.sorted === "asc" ? "ascending" : label.sorted === "desc" ? "descending" : undefined
                        }
                        className="min-w-0"
                    >
                        <Link
                            href={label.href}
                            scroll={false}
                            title={`Sort by ${label.label.toLowerCase()}`}
                            className={`group/sort -mx-1 inline-flex max-w-full items-center gap-1 rounded px-1 hover:text-foreground ${label.sorted ? "text-foreground" : ""}`}
                        >
                            <span className="truncate">{label.label}</span>
                            {label.sorted ? (
                                <span aria-hidden>{label.sorted === "asc" ? "▲" : "▼"}</span>
                            ) : (
                                // Shows the column sorts, always there (in the header's quieter color), full on hover.
                                <span
                                    aria-hidden
                                    className="text-subtle group-hover/sort:text-foreground group-focus-visible/sort:text-foreground"
                                >
                                    ↕
                                </span>
                            )}
                        </Link>
                    </span>
                ),
            )}
        </div>
    );
}

export function ListRow({ cols, children }: { cols: string; children: React.ReactNode }): React.ReactElement {
    return (
        <div role="row" className="relative transition-colors hover:bg-surface-hover/60">
            <div
                className={`flex flex-col gap-1 px-4 py-3 text-sm list-wide:grid list-wide:items-center list-wide:gap-4 list-wide:py-3.5 ${cols}`}
            >
                {children}
            </div>
        </div>
    );
}

// The row's link, in its main cell. Its ::after covers the whole row, so clicking anywhere opens it; the focus ring
// is drawn around the row.
export function RowLink({
    href,
    children,
    className = "",
}: {
    href: string;
    children: React.ReactNode;
    className?: string;
}): React.ReactElement {
    return (
        <Link
            href={href}
            className={`after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-accent ${className}`}
        >
            {children}
        </Link>
    );
}

export function Cell({ className = "", children }: { className?: string; children?: React.ReactNode }) {
    return (
        <div role="cell" className={`min-w-0 empty:hidden list-wide:empty:block ${className}`}>
            {children}
        </div>
    );
}

// A link inside a row (phone, email) that sits above the row link.
export function ListLink({ href, children }: { href: string; children: React.ReactNode }) {
    return (
        <a
            href={href}
            className="relative z-10 inline-block max-w-full truncate align-bottom underline decoration-line-strong/70 underline-offset-2 hover:text-foreground hover:decoration-current"
        >
            {children}
        </a>
    );
}

export function Favorite({ show }: { show: boolean }) {
    if (!show) return null;
    return (
        <span className="ml-1.5 shrink-0 text-secondary" role="img" aria-label="Favorite">
            ★
        </span>
    );
}

// The sort options for phones, where the column headers are hidden. A native <details> menu, so it works without
// JavaScript: each option is the same link as its column header.
export function MobileSort({ labels }: { labels: (string | SortLabel)[] }): React.ReactElement | null {
    const options = labels.filter((label): label is SortLabel => typeof label !== "string");
    if (options.length === 0) return null;
    const current = options.find((option) => option.sorted);

    return (
        <details className="group relative md:hidden">
            <summary className="flex h-10 cursor-pointer list-none items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-sm text-muted hover:text-foreground [&::-webkit-details-marker]:hidden">
                <span className="sr-only">Sort by </span>
                <span aria-hidden>Sort:</span>
                <span className="text-foreground">
                    {current ? `${current.label} ${current.sorted === "asc" ? "↑" : "↓"}` : "Default"}
                </span>
            </summary>
            <ul className="absolute right-0 top-full z-20 mt-1 min-w-44 rounded-lg border border-line bg-surface py-1 shadow-lg">
                {options.map((option) => (
                    <li key={option.label}>
                        <Link
                            href={option.href}
                            scroll={false}
                            aria-current={option.sorted ? "true" : undefined}
                            className={`flex items-center justify-between gap-3 px-3 py-2.5 text-sm hover:bg-surface-hover ${option.sorted ? "text-foreground" : "text-muted"}`}
                        >
                            {option.label}
                            {option.sorted && <span aria-hidden>{option.sorted === "asc" ? "↑" : "↓"}</span>}
                        </Link>
                    </li>
                ))}
            </ul>
        </details>
    );
}
