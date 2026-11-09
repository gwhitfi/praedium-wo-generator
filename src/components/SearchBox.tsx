"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SearchIcon, XIcon } from "./Icons";
import { Spinner } from "./Button";
import { MAX_QUERY_LENGTH } from "@/lib/search";

// The search field above a list. Filters as you type (the page reads ?q=), and still works as a plain GET form
// without JavaScript. `keep` are the other query params to carry over (filter, sort). Press "/" to jump to it.
export default function SearchBox({
    label,
    placeholder,
    initial,
    keep = {},
    autoFocus = false,
    action,
}: {
    label: string;
    placeholder: string;
    initial: string;
    keep?: Record<string, string>;
    autoFocus?: boolean;
    // Where the form submits; the current page by default.
    action?: string;
}): React.ReactElement {
    const router = useRouter();
    const pathname = usePathname();
    const target = action ?? pathname;
    const id = useId();
    const inputRef = useRef<HTMLInputElement>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [value, setValue] = useState(initial);
    const [pending, startTransition] = useTransition();

    function hrefFor(query: string) {
        const params = new URLSearchParams(keep);
        if (query.trim()) params.set("q", query.trim());
        const search = params.toString();
        return search ? `${target}?${search}` : target;
    }

    function update(query: string) {
        setValue(query);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
            startTransition(() => router.replace(hrefFor(query), { scroll: false }));
        }, 250);
    }

    useEffect(() => {
        function onKeyDown(event: KeyboardEvent) {
            if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
            const tag = (event.target as HTMLElement).closest("input, textarea, select, [contenteditable]");
            if (tag || document.querySelector("dialog[open]")) return;
            event.preventDefault();
            inputRef.current?.focus();
        }
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("keydown", onKeyDown);
            if (timer.current) clearTimeout(timer.current);
        };
    }, []);

    return (
        <form
            role="search"
            action={target}
            onSubmit={(event) => {
                event.preventDefault();
                if (timer.current) clearTimeout(timer.current);
                startTransition(() => router.replace(hrefFor(value), { scroll: false }));
            }}
            className="relative w-full sm:max-w-xs"
        >
            {Object.entries(keep).map(([name, keepValue]) => (
                <input key={name} type="hidden" name={name} value={keepValue} />
            ))}
            <label htmlFor={id} className="sr-only">
                {label}
            </label>
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-subtle">
                {pending ? <Spinner className="h-4 w-4" /> : <SearchIcon size={16} />}
            </span>
            <input
                ref={inputRef}
                id={id}
                type="search"
                name="q"
                value={value}
                onChange={(event) => update(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key === "Escape" && value) {
                        event.preventDefault();
                        update("");
                    }
                }}
                placeholder={placeholder}
                maxLength={MAX_QUERY_LENGTH}
                autoFocus={autoFocus}
                autoComplete="off"
                aria-busy={pending || undefined}
                className="h-10 w-full rounded-md border border-line-strong bg-surface pr-10 pl-9 text-base text-foreground placeholder:text-subtle focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40 sm:text-sm [&::-webkit-search-cancel-button]:hidden"
            />
            {value ? (
                <button
                    type="button"
                    onClick={() => {
                        update("");
                        inputRef.current?.focus();
                    }}
                    aria-label="Clear search"
                    className="absolute inset-y-0 right-0 flex h-10 w-10 items-center justify-center rounded-md text-subtle hover:cursor-pointer hover:text-foreground"
                >
                    <XIcon size={14} />
                </button>
            ) : (
                <kbd
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 right-2 my-auto hidden h-5 items-center rounded border border-line-strong px-1.5 font-sans text-xs text-subtle sm:flex"
                >
                    /
                </kbd>
            )}
        </form>
    );
}
