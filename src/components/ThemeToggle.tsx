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

// The saved choice: light, dark, or nothing saved, which follows the device (see themeScript).
type ThemeChoice = Theme | "device";
const CHOICE_EVENT = "praedium-theme-choice";
function subscribeChoice(onChange: () => void) {
    window.addEventListener(CHOICE_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
        window.removeEventListener(CHOICE_EVENT, onChange);
        window.removeEventListener("storage", onChange);
    };
}
function getChoice(): ThemeChoice {
    try {
        const saved = localStorage.getItem(THEME_STORAGE_KEY);
        return saved === "light" || saved === "dark" ? saved : "device";
    } catch {
        return "device";
    }
}
function choose(choice: ThemeChoice) {
    try {
        if (choice === "device") localStorage.removeItem(THEME_STORAGE_KEY);
        else localStorage.setItem(THEME_STORAGE_KEY, choice);
    } catch {
        // Storage can be blocked (e.g. private browsing); the theme still changes for this page.
    }
    document.documentElement.dataset.theme =
        choice === "device" ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : choice;
    window.dispatchEvent(new Event(CHOICE_EVENT));
}

const CHOICES: { value: ThemeChoice; label: string }[] = [
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
    { value: "device", label: "Device" },
];

// With `label`, renders as the menu's "Theme" row: Light, Dark, or follow the device. Without it, the public pages'
// icon button that flips between light and dark.
export default function ThemeToggle({ label = false }: { label?: boolean }) {
    const theme = useSyncExternalStore(subscribe, getTheme, getServerTheme);
    const choice = useSyncExternalStore(subscribeChoice, getChoice, () => null);
    const next: Theme = theme === "light" ? "dark" : "light";

    function toggle() {
        choose(next);
    }

    if (label) {
        return (
            <div className="flex items-center gap-3 px-3 py-2 text-sm text-secondary">
                <MoonIcon size={16} />
                <span id="theme-choice-label" className="flex-1">
                    Theme
                </span>
                {/* Native radio buttons (visually hidden), so the arrow keys move between the choices and the
                    group is one tab stop. */}
                <div
                    role="radiogroup"
                    aria-labelledby="theme-choice-label"
                    className="flex rounded-md border border-line-strong p-0.5"
                >
                    {CHOICES.map((option) => {
                        const selected = choice === option.value;
                        return (
                            <label
                                key={option.value}
                                className={`flex h-8 items-center rounded px-2 text-[0.8125rem] hover:cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
                                    selected
                                        ? "bg-surface-hover font-medium text-foreground"
                                        : "text-muted hover:text-foreground"
                                }`}
                            >
                                <input
                                    type="radio"
                                    name="theme-choice"
                                    value={option.value}
                                    checked={selected}
                                    disabled={!choice}
                                    onChange={() => choose(option.value)}
                                    className="sr-only"
                                />
                                {option.label}
                            </label>
                        );
                    })}
                </div>
            </div>
        );
    }

    return (
        <button
            type="button"
            onClick={toggle}
            disabled={!theme}
            aria-label={`Switch to ${next} theme`}
            title={`Switch to ${next} theme`}
            className="flex h-10 w-10 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground hover:cursor-pointer"
        >
            {theme === "light" && <MoonIcon />}
            {theme === "dark" && <SunIcon />}
        </button>
    );
}

const iconProps = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
} as const;

function SunIcon({ size = 18 }: { size?: number }) {
    return (
        <svg width={size} height={size} {...iconProps}>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
    );
}

function MoonIcon({ size = 18 }: { size?: number }) {
    return (
        <svg width={size} height={size} {...iconProps}>
            <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
    );
}
