import { describe, expect, it } from "vitest";
import { DARK_PALETTE_IDS, themeScript } from "./theme";

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

    it("applies each saved dark theme in the app", () => {
        for (const id of DARK_PALETTE_IDS) {
            expect(run("/settings", { theme: "dark", "palette-dark": id })).toEqual({ theme: "dark", paletteDark: id });
        }
    });

    it("ignores removed or unknown saved themes and any saved light palette", () => {
        expect(run("/settings", { theme: "dark", "palette-dark": "pine-den" })).toEqual({ theme: "dark" });
        expect(run("/settings", { theme: "dark", "palette-dark": "porchlight" })).toEqual({ theme: "dark" });
        expect(run("/settings", { theme: "dark", "palette-dark": "toString" })).toEqual({ theme: "dark" });
        expect(run("/settings", { theme: "light", "palette-light": "porchlight" })).toEqual({ theme: "light" });
    });

    it("never applies the dark theme choice on contractor pages", () => {
        expect(run("/wo/abc123", { theme: "dark", "palette-dark": "flint" })).toEqual({ theme: "dark" });
    });

    it("never applies the dark theme choice on the demo's contractor view, but does on the rest of the demo", () => {
        const saved = { theme: "dark", "palette-dark": "cinder" };
        expect(run("/demo/contractor", saved)).toEqual({ theme: "dark" });
        expect(run("/demo/contractor/x", saved)).toEqual({ theme: "dark" });
        expect(run("/demo", saved)).toEqual({ theme: "dark", paletteDark: "cinder" });
        expect(run("/demo/contractors", saved)).toEqual({ theme: "dark", paletteDark: "cinder" });
    });
});
