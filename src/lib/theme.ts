// Light/dark theme. The theme is the data-theme attribute on <html>; globals.css switches colors on it.
export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "theme";

// The palette picked in Settings for each theme (src/lib/palettes.ts); the data-palette-light and
// data-palette-dark attributes on <html>.
export const PALETTE_STORAGE_KEYS = { light: "palette-light", dark: "palette-dark" } as const;

// The saved theme choice: "device" follows the device setting. Nothing saved means dark, the default.
export const DEVICE_THEME = "device";

// Runs in <head> before the page paints, so there's no flash of the wrong theme.
// Uses the saved choice, and dark when nothing is saved. The contractor pages (/wo/...) skip palettes: they only
// use the standard light and dark themes.
export const themeScript =
    `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});` +
    `if(t===${JSON.stringify(DEVICE_THEME)})t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";` +
    `else if(t!=="light"&&t!=="dark")t="dark";` +
    `document.documentElement.dataset.theme=t;` +
    `if(location.pathname.indexOf("/wo/")!==0){` +
    `var l=localStorage.getItem(${JSON.stringify(PALETTE_STORAGE_KEYS.light)}),` +
    `d=localStorage.getItem(${JSON.stringify(PALETTE_STORAGE_KEYS.dark)});` +
    `if(l)document.documentElement.dataset.paletteLight=l;` +
    `if(d)document.documentElement.dataset.paletteDark=d}}catch(e){}`;
