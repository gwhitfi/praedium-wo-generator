"use client";

import { useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY, type Theme } from "@/lib/theme";

function subscribe(onChange: () => void) {
    const observer = new MutationObserver(onChange);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
}
const getTheme = (): Theme => (document.documentElement.dataset.theme === "light" ? "light" : "dark");
// The server doesn't know the theme, so the button renders empty until the browser takes over.
const getServerTheme = () => null;

// With `label`, renders as a full-width "Dark mode" menu row with an on/off switch instead of an icon button.
export default function ThemeToggle({ label = false }: { label?: boolean }) {
    const theme = useSyncExternalStore(subscribe, getTheme, getServerTheme);
    const next: Theme = theme === "light" ? "dark" : "light";

    function toggle() {
        document.documentElement.dataset.theme = next;
        try {
            localStorage.setItem(THEME_STORAGE_KEY, next);
        } catch {
            // Storage can be blocked (e.g. private browsing); the theme still changes for this page.
        }
    }

    if (label) {
        return (
            <button
                type="button"
                role="switch"
                aria-checked={theme === "dark"}
                onClick={toggle}
                disabled={!theme}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-muted hover:bg-surface-hover hover:text-foreground hover:cursor-pointer"
            >
                <MoonIcon />
                <span className="flex-1">Dark mode</span>
                <span
                    aria-hidden
                    className={`flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition-colors ${theme === "dark" ? "bg-accent" : "bg-line-strong"}`}
                >
                    <span
                        className={`h-3 w-3 rounded-full transition-transform ${theme === "dark" ? "translate-x-3 bg-surface" : "bg-foreground"}`}
                    />
                </span>
            </button>
        );
    }

    return (
        <button
            type="button"
            onClick={toggle}
            disabled={!theme}
            aria-label={`Switch to ${next} theme`}
            title={`Switch to ${next} theme`}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground hover:cursor-pointer"
        >
            {theme === "light" && <MoonIcon />}
            {theme === "dark" && <SunIcon />}
        </button>
    );
}

const iconProps = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
} as const;

function SunIcon() {
    return (
        <svg {...iconProps}>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
    );
}

function MoonIcon() {
    return (
        <svg {...iconProps}>
            <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
    );
}
