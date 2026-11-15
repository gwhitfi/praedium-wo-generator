import { useSyncExternalStore } from "react";
import { isDarkPaletteId, PALETTE_STORAGE_KEYS, THEME_STORAGE_KEY, type DarkPaletteId } from "./theme";

// The dark themes, picked in Settings (_docs/THEME.md). "default" is Hearth, the plain dark block in globals.css;
// each other one is a [data-theme="dark"][data-palette-dark] block there. Light mode has a single theme, Daybreak.
export const DARK_PALETTES: readonly { id: "default" | DarkPaletteId; name: string }[] = [
    { id: "default", name: "Hearth" },
    { id: "flint", name: "Flint" },
    { id: "woodsmoke", name: "Woodsmoke" },
    { id: "cinder", name: "Cinder" },
];

export const DARK_PALETTE_ATTR = "data-palette-dark";

export type PaletteState = { theme: "light" | "dark"; dark: string };

function save(key: string, value: string | null) {
    try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
    } catch {
        // Storage can be blocked (e.g. private browsing); the theme still applies to this page.
    }
}

// Sets the dark theme and switches to dark mode so the change is visible. An unknown id falls back to Hearth.
export function applyDarkPalette(id: string): void {
    const root = document.documentElement;
    root.dataset.theme = "dark";
    save(THEME_STORAGE_KEY, "dark");
    const palette = isDarkPaletteId(id) ? id : null;
    if (palette) root.setAttribute(DARK_PALETTE_ATTR, palette);
    else root.removeAttribute(DARK_PALETTE_ATTR);
    save(PALETTE_STORAGE_KEYS.dark, palette);
}

function subscribe(onChange: () => void) {
    const observer = new MutationObserver(onChange);
    observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme", DARK_PALETTE_ATTR],
    });
    return () => observer.disconnect();
}
// A string snapshot ("theme|dark") so React compares it by value.
function getSnapshot() {
    const root = document.documentElement;
    return [root.dataset.theme === "light" ? "light" : "dark", root.getAttribute(DARK_PALETTE_ATTR) ?? "default"].join(
        "|",
    );
}
// The server doesn't know the saved choices, so it renders null until the browser takes over.
const getServerSnapshot = () => null;

// The current theme and the dark theme, kept in sync with <html>. Null during server rendering.
export function usePalettes(): PaletteState | null {
    const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
    if (!snapshot) return null;
    const [theme, dark] = snapshot.split("|");
    return { theme: theme === "light" ? "light" : "dark", dark };
}
