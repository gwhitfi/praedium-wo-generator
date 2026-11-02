import { describe, expect, it } from "vitest";
import { themeScript } from "./theme";

// Runs the inline <head> script against fake browser globals and returns the <html> dataset it produced.
function run(path: string, stored: Record<string, string>, prefersLight = false) {
    const dataset: Record<string, string> = {};
    const fakes = {
        localStorage: { getItem: (key: string) => stored[key] ?? null },
        matchMedia: () => ({ matches: prefersLight }),
        location: { pathname: path },
        document: { documentElement: { dataset } },
    };
    new Function(...Object.keys(fakes), themeScript)(...Object.values(fakes));
    return dataset;
}

describe("themeScript", () => {
    it("uses the saved theme, or the device setting when nothing is saved", () => {
        expect(run("/", { theme: "light" }).theme).toBe("light");
        expect(run("/", {}, true).theme).toBe("light");
        expect(run("/", {}).theme).toBe("dark");
    });

    it("starts contractor pages dark, ignoring the device setting, but keeps a saved choice", () => {
        expect(run("/wo/abc123", {}, true).theme).toBe("dark");
        expect(run("/wo/abc123", { theme: "light" }, false).theme).toBe("light");
    });

    it("applies the saved palettes in the app", () => {
        expect(run("/settings", { theme: "dark", "palette-light": "sage", "palette-dark": "navy" })).toEqual({
            theme: "dark",
            paletteLight: "sage",
            paletteDark: "navy",
        });
    });

    it("never applies palettes on contractor pages", () => {
        expect(run("/wo/abc123", { theme: "light", "palette-light": "sage", "palette-dark": "navy" })).toEqual({
            theme: "light",
        });
    });
});
