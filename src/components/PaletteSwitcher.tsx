"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { PALETTE_STORAGE_KEYS, THEME_STORAGE_KEY, type Theme } from "@/lib/theme";

// Dev-only tool for trying palettes live (rendered from the root layout in development only). Each palette is a
// [data-theme][data-palette-light|dark] block in globals.css; "default" is the plain theme. One palette is kept
// per theme, so the light/dark toggle switches between the two picks.
const PALETTES = {
    light: [
        { id: "default", name: "Light" },
        { id: "sage", name: "Sage" },
        { id: "lavender", name: "Lavender" },
        { id: "blue", name: "Blue" },
    ],
    dark: [
        { id: "default", name: "Dark" },
        { id: "navy", name: "Navy" },
        { id: "forest", name: "Forest" },
        { id: "plum", name: "Plum" },
        { id: "espresso", name: "Espresso" },
    ],
} as const;

const ATTRS = { light: "data-palette-light", dark: "data-palette-dark" } as const;

function save(key: string, value: string | null) {
    try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
    } catch {
        // Storage can be blocked; the palette still applies to this page.
    }
}

function subscribe(onChange: () => void) {
    const observer = new MutationObserver(onChange);
    observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme", ATTRS.light, ATTRS.dark],
    });
    return () => observer.disconnect();
}
// A string snapshot ("theme|light|dark") so React can compare it by value.
const getSnapshot = () => {
    const root = document.documentElement;
    return [
        root.dataset.theme === "light" ? "light" : "dark",
        root.getAttribute(ATTRS.light) ?? "default",
        root.getAttribute(ATTRS.dark) ?? "default",
    ].join("|");
};
const getServerSnapshot = () => "dark|default|default";

export default function PaletteSwitcher(): React.ReactElement {
    const [open, setOpen] = useState(false);
    const [theme, lightId, darkId] = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot).split("|") as [
        Theme,
        string,
        string,
    ];
    const selected = { light: lightId, dark: darkId };

    useEffect(() => {
        if (!open) return;
        function onKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") setOpen(false);
        }
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [open]);

    // Picking a palette also switches to its theme.
    function apply(mode: Theme, id: string) {
        const root = document.documentElement;
        root.dataset.theme = mode;
        save(THEME_STORAGE_KEY, mode);
        if (id === "default") root.removeAttribute(ATTRS[mode]);
        else root.setAttribute(ATTRS[mode], id);
        save(PALETTE_STORAGE_KEYS[mode], id === "default" ? null : id);
    }

    // Steps through the current theme's palettes.
    function step(by: number) {
        const list = PALETTES[theme];
        const i = list.findIndex((p) => p.id === selected[theme]);
        apply(theme, list[(i + by + list.length) % list.length].id);
    }

    return (
        <div className="fixed right-4 bottom-4 z-50 print:hidden">
            {open && (
                <div className="mb-2 w-60 overflow-hidden rounded-lg border border-line-strong bg-surface text-foreground shadow-xl">
                    <div className="flex items-center justify-between border-b border-line px-3 py-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Palettes (dev)</p>
                        <div className="flex gap-1">
                            <StepButton label="Previous palette" onClick={() => step(-1)}>
                                ‹
                            </StepButton>
                            <StepButton label="Next palette" onClick={() => step(1)}>
                                ›
                            </StepButton>
                        </div>
                    </div>
                    <div className="max-h-[70vh] overflow-y-auto py-1">
                        {(["light", "dark"] as const).map((mode) => (
                            <div key={mode}>
                                <p className="px-3 pt-2 pb-1 text-xs text-subtle">
                                    {mode === "light" ? "Light" : "Dark"}
                                    {theme === mode && " · showing"}
                                </p>
                                <ul>
                                    {PALETTES[mode].map((p) => {
                                        const isSelected = selected[mode] === p.id;
                                        const isShowing = isSelected && theme === mode;
                                        return (
                                            <li key={p.id}>
                                                <button
                                                    type="button"
                                                    onClick={() => apply(mode, p.id)}
                                                    aria-pressed={isShowing}
                                                    className={`flex w-full items-center gap-3 px-3 py-1.5 text-left text-sm hover:bg-surface-hover hover:cursor-pointer ${isShowing ? "font-semibold" : ""}`}
                                                >
                                                    <Swatch mode={mode} id={p.id} />
                                                    <span className="flex-1">{p.name}</span>
                                                    {isSelected && (
                                                        <span className={isShowing ? "text-accent" : "text-faint"}>
                                                            ●
                                                        </span>
                                                    )}
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            <button
                type="button"
                onClick={() => setOpen(!open)}
                aria-expanded={open}
                aria-label="Palette switcher"
                title="Palette switcher (dev)"
                className="ml-auto flex h-10 w-10 items-center justify-center rounded-full border border-line-strong bg-surface text-accent shadow-lg hover:bg-surface-hover hover:cursor-pointer"
            >
                <PaletteIcon />
            </button>
        </div>
    );
}

// The swatch carries the palette's own attributes, so its colors come straight from globals.css.
function Swatch({ mode, id }: { mode: Theme; id: string }) {
    const attrs = id === "default" ? {} : { [ATTRS[mode]]: id };
    return (
        <span
            data-theme={mode}
            {...attrs}
            className="flex h-6 shrink-0 overflow-hidden rounded border border-line-strong bg-background"
        >
            <span className="w-3 bg-background" />
            <span className="w-3 bg-surface" />
            <span className="w-3 bg-accent" />
            <span className="w-2 bg-status-sent" />
            <span className="w-2 bg-status-in-progress" />
            <span className="w-2 bg-status-closed" />
        </span>
    );
}

function StepButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={label}
            title={label}
            className="flex h-6 w-6 items-center justify-center rounded border border-line text-sm text-muted hover:bg-surface-hover hover:text-foreground hover:cursor-pointer"
        >
            {children}
        </button>
    );
}

function PaletteIcon() {
    return (
        <svg
            width={20}
            height={20}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
        >
            <path d="M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.4A4.6 4.6 0 0 0 21 9.8C21 6 17 3 12 3Z" />
            <circle cx="7.5" cy="11" r="1" />
            <circle cx="10" cy="7" r="1" />
            <circle cx="15" cy="7" r="1" />
        </svg>
    );
}
