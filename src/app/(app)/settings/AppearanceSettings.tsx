"use client";

import { applyDarkPalette, DARK_PALETTE_ATTR, DARK_PALETTES, usePalettes } from "@/lib/palettes";
import { cardClass } from "@/lib/ui";

// The dark theme picker (light mode has a single theme). The choice is saved in this browser, like the light/dark
// toggle itself.
export default function AppearanceSettings(): React.ReactElement {
    const state = usePalettes();

    return (
        <section aria-labelledby="appearance-title" className={`${cardClass} overflow-hidden`}>
            <div className="p-5 sm:p-6">
                <h3 id="appearance-title" className="text-base font-semibold text-foreground">
                    Appearance
                </h3>
                <p className="mt-1 text-sm text-muted">
                    Pick a theme for dark mode. Light mode has one look. The Theme choice in the account menu (Light,
                    Dark or Device) decides which mode shows.
                </p>

                <div className="mt-5">
                    <p className="mb-2 flex items-center gap-2 text-sm font-medium text-secondary">
                        Dark mode
                        {state?.theme === "dark" && (
                            <span className="rounded-full border border-line-strong px-2 py-0.5 text-xs font-normal text-subtle">
                                Showing now
                            </span>
                        )}
                    </p>
                    <div role="radiogroup" aria-label="Dark mode theme" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {/* Native radio buttons (visually hidden) inside the cards, so the arrow keys move between
                            themes and the group is one tab stop, as with any radio group. */}
                        {DARK_PALETTES.map((p) => {
                            const checked = state?.dark === p.id;
                            return (
                                <label
                                    key={p.id}
                                    className={`rounded-lg border p-1.5 text-left hover:cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent-ink ${
                                        checked
                                            ? "border-accent-ink ring-1 ring-accent-ink"
                                            : "border-line hover:border-line-hover"
                                    }`}
                                >
                                    <input
                                        type="radio"
                                        name="palette-dark"
                                        value={p.id}
                                        checked={checked}
                                        onChange={() => applyDarkPalette(p.id)}
                                        className="sr-only"
                                    />
                                    <Preview id={p.id} />
                                    <span className="mt-1.5 flex items-center justify-between px-0.5 text-sm text-foreground">
                                        <span>
                                            {p.name}
                                            {p.id === "default" && <span className="text-subtle"> (default)</span>}
                                        </span>
                                        {checked && <CheckIcon />}
                                    </span>
                                </label>
                            );
                        })}
                    </div>
                </div>
            </div>
            <p className="border-t border-line bg-background/40 px-5 py-3 text-sm text-muted sm:px-6">
                Applies right away and is saved on this device.
            </p>
        </section>
    );
}

// A tiny page drawn in the theme's own colors (page, card, text, accent): the tile carries the dark theme and palette
// attributes, so globals.css supplies the colors.
function Preview({ id }: { id: string }) {
    const attrs = id === "default" ? {} : { [DARK_PALETTE_ATTR]: id };
    return (
        <span data-theme="dark" {...attrs} className="block rounded-md bg-background p-2">
            <span className="block rounded border border-line bg-surface p-1.5">
                <span className="block h-1.5 w-3/4 rounded-full bg-foreground/80" />
                <span className="mt-1 block h-1.5 w-1/2 rounded-full bg-muted/50" />
                <span className="mt-2 flex items-center gap-1">
                    <span className="h-2.5 w-6 rounded-sm bg-accent" />
                    <span className="h-1.5 w-1.5 rounded-full bg-status-sent" />
                    <span className="h-1.5 w-1.5 rounded-full bg-status-in-progress" />
                    <span className="h-1.5 w-1.5 rounded-full bg-status-completed" />
                </span>
            </span>
        </span>
    );
}

function CheckIcon() {
    return (
        <svg
            width={16}
            height={16}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className="text-accent-ink"
        >
            <path d="M5 12l5 5L19 7" />
        </svg>
    );
}
