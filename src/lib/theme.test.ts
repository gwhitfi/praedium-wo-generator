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
    it("uses the saved theme, and dark when nothing is saved, whatever the device prefers", () => {
        expect(run("/", { theme: "light" }).theme).toBe("light");
        expect(run("/", { theme: "dark" }, true).theme).toBe("dark");
        expect(run("/", {}, true).theme).toBe("dark");
        expect(run("/", {}).theme).toBe("dark");
        expect(run("/", { theme: "something-old" }, true).theme).toBe("dark");
    });

    it("follows the device setting when that is the saved choice", () => {
        expect(run("/", { theme: "device" }, true).theme).toBe("light");
        expect(run("/", { theme: "device" }, false).theme).toBe("dark");
    });

    it("starts contractor pages dark too, but keeps a saved choice", () => {
        expect(run("/wo/abc123", {}, true).theme).toBe("dark");
        expect(run("/wo/abc123", { theme: "light" }, false).theme).toBe("light");
    });

    it("applies the saved palettes in the app", () => {
        expect(run("/settings", { theme: "dark", "palette-light": "pine-den", "palette-dark": "porchlight" })).toEqual({
            theme: "dark",
            paletteLight: "pine-den",
            paletteDark: "porchlight",
        });
    });

    it("never applies palettes on contractor pages", () => {
        expect(run("/wo/abc123", { theme: "light", "palette-light": "pine-den", "palette-dark": "porchlight" })).toEqual({
            theme: "light",
        });
    });
});
