"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { filterOptions, type ComboOption } from "@/lib/options";
import { CheckIcon, ChevronDownIcon, PlusIcon, SearchIcon } from "@/components/Icons";
import type { ControlProps } from "./Field";

// A dropdown with a search box, for long lists (properties, contractors). The button shows the choice; opening it
// shows a search field above the options. Starred options get a ★. Works with the keyboard (arrows, Enter, Escape,
// or start typing on the closed button) and follows the ARIA combobox pattern.
// With `name`, a hidden input carries the value, so it works inside a plain <form>.
export default function Combobox({
    options,
    value,
    onChange,
    name,
    placeholder = "Choose…",
    searchPlaceholder = "Search…",
    emptyText = "No matches",
    action,
    disabled = false,
    controlProps,
}: {
    options: ComboOption[];
    value: string;
    onChange: (value: string) => void;
    name?: string;
    placeholder?: string;
    searchPlaceholder?: string;
    emptyText?: string;
    // A command under the options, such as "+ Add a new property".
    action?: { label: string; onSelect: () => void };
    disabled?: boolean;
    // The ids and ARIA attributes from Field, so the label, hint and error point at the button.
    controlProps?: ControlProps;
}): React.ReactElement {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [activeIndex, setActiveIndex] = useState(0);
    const rootRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const listId = useId();
    const optionId = (index: number) => `${listId}-option-${index}`;

    const selected = options.find((option) => option.value === value);
    const matches = useMemo(() => filterOptions(options, query), [options, query]);
    // The action counts as one more row for the arrow keys.
    const rowCount = matches.length + (action ? 1 : 0);

    function openWith(text = "") {
        if (disabled) return;
        setQuery(text);
        const current = text ? 0 : Math.max(0, options.findIndex((option) => option.value === value));
        setActiveIndex(current);
        setOpen(true);
    }

    function close(focusButton = true) {
        setOpen(false);
        setQuery("");
        if (focusButton) buttonRef.current?.focus();
    }

    function choose(index: number) {
        if (index < matches.length) {
            onChange(matches[index].value);
            close();
        } else if (action) {
            close(false);
            action.onSelect();
        }
    }

    useEffect(() => {
        if (!open) return;
        inputRef.current?.focus();
        function onPointerDown(event: PointerEvent) {
            if (rootRef.current?.contains(event.target as Node)) return;
            setOpen(false);
            setQuery("");
        }
        document.addEventListener("pointerdown", onPointerDown);
        return () => document.removeEventListener("pointerdown", onPointerDown);
    }, [open]);

    // Keep the highlighted option in view while moving with the arrow keys.
    useEffect(() => {
        if (!open) return;
        document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: "nearest" });
        // eslint-disable-next-line react-hooks/exhaustive-deps -- optionId only depends on listId
    }, [activeIndex, open]);

    function onSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
        if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((i) => Math.min(rowCount - 1, i + 1));
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((i) => Math.max(0, i - 1));
        } else if (event.key === "Home") {
            event.preventDefault();
            setActiveIndex(0);
        } else if (event.key === "End") {
            event.preventDefault();
            setActiveIndex(Math.max(0, rowCount - 1));
        } else if (event.key === "Enter") {
            event.preventDefault();
            if (rowCount > 0) choose(activeIndex);
        } else if (event.key === "Escape") {
            event.preventDefault();
            close();
        } else if (event.key === "Tab") {
            close(false);
        }
    }

    return (
        <div ref={rootRef} className="relative">
            {name !== undefined && <input type="hidden" name={name} value={value} />}
            <button
                ref={buttonRef}
                type="button"
                {...controlProps}
                role="combobox"
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={open ? listId : undefined}
                disabled={disabled}
                onClick={() => (open ? close() : openWith())}
                onKeyDown={(event) => {
                    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                        event.preventDefault();
                        openWith();
                    } else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
                        // Typing on the closed button starts a search with that letter.
                        event.preventDefault();
                        openWith(event.key);
                    }
                }}
                className="flex h-10 w-full items-center gap-2 rounded-md border border-line-strong bg-surface px-3 text-left text-base text-foreground hover:cursor-pointer focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-danger sm:text-sm"
            >
                {selected?.starred && (
                    <span aria-hidden className="text-secondary">
                        ★
                    </span>
                )}
                <span className={`min-w-0 flex-1 truncate ${selected ? "" : "text-subtle"}`}>
                    {selected ? selected.label : placeholder}
                    {selected?.starred && <span className="sr-only"> (starred)</span>}
                </span>
                <ChevronDownIcon size={16} className="shrink-0 text-subtle" />
            </button>

            {open && (
                <div className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-line bg-surface shadow-xl sm:min-w-72">
                    <div className="relative border-b border-line">
                        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-subtle">
                            <SearchIcon size={15} />
                        </span>
                        <input
                            ref={inputRef}
                            type="text"
                            role="combobox"
                            aria-expanded="true"
                            aria-controls={listId}
                            aria-autocomplete="list"
                            aria-activedescendant={rowCount > 0 ? optionId(activeIndex) : undefined}
                            aria-label={searchPlaceholder}
                            value={query}
                            onChange={(event) => {
                                setQuery(event.target.value);
                                setActiveIndex(0);
                            }}
                            onKeyDown={onSearchKeyDown}
                            placeholder={searchPlaceholder}
                            autoComplete="off"
                            className="h-11 w-full bg-transparent pr-3 pl-9 text-base text-foreground placeholder:text-subtle focus:outline-none sm:text-sm"
                        />
                    </div>
                    <ul
                        ref={listRef}
                        id={listId}
                        role="listbox"
                        aria-label={searchPlaceholder}
                        className="max-h-[min(18rem,50vh)] overflow-y-auto py-1"
                    >
                        {matches.length === 0 && (
                            <li role="presentation" className="px-3 py-3 text-sm text-subtle">
                                {emptyText}
                            </li>
                        )}
                        {matches.map((option, index) => {
                            const showGroup = option.group && option.group !== matches[index - 1]?.group;
                            const isSelected = option.value === value;
                            const isActive = index === activeIndex;
                            return [
                                showGroup ? (
                                    <li
                                        key={`group-${option.group}`}
                                        role="presentation"
                                        className="px-3 pt-2.5 pb-1 text-xs font-medium uppercase tracking-wide text-subtle"
                                    >
                                        {option.group}
                                    </li>
                                ) : null,
                                <li
                                    key={option.value || "__empty"}
                                    id={optionId(index)}
                                    role="option"
                                    aria-selected={isSelected}
                                    onPointerMove={() => setActiveIndex(index)}
                                    onClick={() => choose(index)}
                                    className={`flex cursor-pointer items-center gap-2 px-3 py-2.5 text-sm sm:py-2 ${
                                        isActive ? "bg-surface-hover" : ""
                                    }`}
                                >
                                    <span aria-hidden className="w-3.5 shrink-0 text-secondary">
                                        {option.starred ? "★" : ""}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-foreground">
                                            {option.label}
                                            {option.starred && <span className="sr-only"> (starred)</span>}
                                        </span>
                                        {option.description && (
                                            <span className="block truncate text-[0.8125rem] text-muted">
                                                {option.description}
                                            </span>
                                        )}
                                    </span>
                                    {isSelected && <CheckIcon size={14} className="shrink-0 text-accent" />}
                                </li>,
                            ];
                        })}
                        {action && (
                            <li
                                id={optionId(matches.length)}
                                role="option"
                                aria-selected={false}
                                onPointerMove={() => setActiveIndex(matches.length)}
                                onClick={() => choose(matches.length)}
                                className={`mt-1 flex cursor-pointer items-center gap-2 border-t border-line px-3 py-2.5 text-sm font-medium text-accent ${
                                    activeIndex === matches.length ? "bg-surface-hover" : ""
                                }`}
                            >
                                <PlusIcon size={14} />
                                {action.label}
                            </li>
                        )}
                    </ul>
                </div>
            )}
        </div>
    );
}
