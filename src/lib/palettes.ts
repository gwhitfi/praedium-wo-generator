import { useSyncExternalStore } from "react";
import { PALETTE_STORAGE_KEYS, THEME_STORAGE_KEY, type Theme } from "./theme";

// Color palettes for each theme, picked in Settings. Each non-default one is a
// [data-theme][data-palette-light|dark] block in globals.css; "default" is the plain theme.
// The light/dark toggle switches between the user's light pick and dark pick.
export const PALETTES = {
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
        { id: "espresso", name: "Espresso" },
    ],
} as const;

export const PALETTE_ATTRS = { light: "data-palette-light", dark: "data-palette-dark" } as const;

export type PaletteState = { theme: Theme; light: string; dark: string };

function save(key: string, value: string | null) {
    try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
    } catch {
        // Storage can be blocked (e.g. private browsing); the palette still applies to this page.
    }
}

// Sets the palette for one theme and switches to that theme so the change is visible.
export function applyPalette(mode: Theme, id: string): void {
    const root = document.documentElement;
    root.dataset.theme = mode;
    save(THEME_STORAGE_KEY, mode);
    if (id === "default") root.removeAttribute(PALETTE_ATTRS[mode]);
    else root.setAttribute(PALETTE_ATTRS[mode], id);
    save(PALETTE_STORAGE_KEYS[mode], id === "default" ? null : id);
}

function subscribe(onChange: () => void) {
    const observer = new MutationObserver(onChange);
    observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme", PALETTE_ATTRS.light, PALETTE_ATTRS.dark],
    });
    return () => observer.disconnect();
}
// A string snapshot ("theme|light|dark") so React compares it by value.
function getSnapshot() {
    const root = document.documentElement;
    return [
        root.dataset.theme === "light" ? "light" : "dark",
        root.getAttribute(PALETTE_ATTRS.light) ?? "default",
        root.getAttribute(PALETTE_ATTRS.dark) ?? "default",
    ].join("|");
}
// The server doesn't know the saved choices, so it renders null until the browser takes over.
const getServerSnapshot = () => null;

// The current theme and each theme's palette, kept in sync with <html>. Null during server rendering.
export function usePalettes(): PaletteState | null {
    const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
    if (!snapshot) return null;
    const [theme, light, dark] = snapshot.split("|");
    return { theme: theme as Theme, light, dark };
}
