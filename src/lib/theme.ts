// Light/dark theme. The theme is the data-theme attribute on <html>; globals.css switches colors on it.
export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "theme";

// The dark theme picked in Settings (src/lib/palettes.ts), saved under the "dark" key; the data-palette-dark
// attribute on <html>. Light mode has a single theme now, so "palette-light" is no longer read (an old saved value
// is ignored); the key stays listed only for the unused dev PaletteSwitcher.
export const PALETTE_STORAGE_KEYS = { light: "palette-light", dark: "palette-dark" } as const;

// The dark themes other than the default (Hearth), each a [data-theme="dark"][data-palette-dark] block in
// globals.css. Any other saved value (e.g. the removed "pine-den" or "porchlight") is ignored.
export const DARK_PALETTE_IDS = ["flint", "woodsmoke", "cinder"] as const;
export type DarkPaletteId = (typeof DARK_PALETTE_IDS)[number];

export function isDarkPaletteId(id: string | null): id is DarkPaletteId {
    return (DARK_PALETTE_IDS as readonly (string | null)[]).includes(id);
}

// The saved theme choice: "device" follows the device setting. Nothing saved means dark, the default.
export const DEVICE_THEME = "device";

// Runs in <head> before the page paints, so there's no flash of the wrong theme.
// Uses the saved choice, and dark when nothing is saved. The contractor pages (/wo/...) and the demo's contractor view
// (/demo/contractor) skip palettes: they only use the standard light theme and Hearth. A saved dark theme is applied
// only when it is one that exists.
export const themeScript =
    `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});` +
    `if(t===${JSON.stringify(DEVICE_THEME)})t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";` +
    `else if(t!=="light"&&t!=="dark")t="dark";` +
    `document.documentElement.dataset.theme=t;` +
    `var p=location.pathname;` +
    `if(p.indexOf("/wo/")!==0&&p!=="/demo/contractor"&&p.indexOf("/demo/contractor/")!==0){` +
    `var d=localStorage.getItem(${JSON.stringify(PALETTE_STORAGE_KEYS.dark)});` +
    `if(${JSON.stringify(DARK_PALETTE_IDS)}.indexOf(d)>=0)document.documentElement.dataset.paletteDark=d}}catch(e){}`;
