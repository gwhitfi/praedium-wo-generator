"use client";

import { applyPalette, PALETTE_ATTRS, PALETTES, usePalettes } from "@/lib/palettes";
import type { Theme } from "@/lib/theme";
import { cardClass } from "@/lib/ui";

// Light and dark palette pickers. Choices are saved in this browser, like the light/dark toggle itself.
export default function AppearanceSettings(): React.ReactElement {
    const state = usePalettes();

    return (
        <section aria-labelledby="appearance-title" className={`${cardClass} overflow-hidden`}>
            <div className="p-5 sm:p-6">
                <h3 id="appearance-title" className="text-base font-semibold text-foreground">
                    Appearance
                </h3>
                <p className="mt-1 text-sm text-muted">
                    Pick a look for light mode and one for dark mode. The Theme choice in the account menu (Light, Dark
                    or Device) decides which of the two shows.
                </p>

                {(["light", "dark"] as const).map((mode) => (
                    <div key={mode} className="mt-5">
                        <p className="mb-2 flex items-center gap-2 text-sm font-medium text-secondary">
                            {mode === "light" ? "Light mode" : "Dark mode"}
                            {state?.theme === mode && (
                                <span className="rounded-full border border-line-strong px-2 py-0.5 text-xs font-normal text-subtle">
                                    Showing now
                                </span>
                            )}
                        </p>
                        <div
                            role="radiogroup"
                            aria-label={mode === "light" ? "Light mode palette" : "Dark mode palette"}
                            className="grid grid-cols-2 gap-3 sm:grid-cols-4"
                        >
                            {/* Native radio buttons (visually hidden) inside the cards, so the arrow keys move between
                                palettes and the group is one tab stop, as with any radio group. */}
                            {PALETTES[mode].map((p) => {
                                const checked = state?.[mode] === p.id;
                                return (
                                    <label
                                        key={p.id}
                                        className={`rounded-lg border p-1.5 text-left hover:cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${
                                            checked
                                                ? "border-accent ring-1 ring-accent"
                                                : "border-line hover:border-line-hover"
                                        }`}
                                    >
                                        <input
                                            type="radio"
                                            name={`palette-${mode}`}
                                            value={p.id}
                                            checked={checked}
                                            onChange={() => applyPalette(mode, p.id)}
                                            className="sr-only"
                                        />
                                        <Preview mode={mode} id={p.id} />
                                        <span className="mt-1.5 flex items-center justify-between px-0.5 text-sm text-foreground">
                                            {p.name}
                                            {checked && <CheckIcon />}
                                        </span>
                                    </label>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
            <p className="border-t border-line bg-background/40 px-5 py-3 text-sm text-muted sm:px-6">
                Applies right away and is saved on this device.
            </p>
        </section>
    );
}

// A tiny page drawn in the palette's own colors: the tile carries its theme and palette attributes,
// so globals.css supplies the colors.
function Preview({ mode, id }: { mode: Theme; id: string }) {
    const attrs = id === "default" ? {} : { [PALETTE_ATTRS[mode]]: id };
    return (
        <span data-theme={mode} {...attrs} className="block rounded-md bg-background p-2">
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
            className="text-accent"
        >
            <path d="M5 12l5 5L19 7" />
        </svg>
    );
}
