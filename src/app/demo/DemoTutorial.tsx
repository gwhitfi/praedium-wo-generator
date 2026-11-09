"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon, XIcon } from "@/components/Icons";

const ChevronUpIcon = () => <ChevronDownIcon size={15} className="rotate-180" />;
const MinimizeIcon = () => <ChevronDownIcon size={16} />;

type Step = { target: string; title: string; text: string; number: number };

// Where the card sits. On phones it spans the width, so bottom left is the same as bottom right.
type Position = "bottom-right" | "bottom-left" | "top";
// On wide screens the card lines up with the page's 64rem content column instead of the window's edge. Written out
// in full so Tailwind generates the classes.
const POSITION_CLASSES: Record<Position, string> = {
    "bottom-right": "bottom-3 sm:right-[max(1.25rem,calc((100vw_-_64rem)/2_+_1rem))] sm:bottom-5",
    "bottom-left": "bottom-3 sm:left-[max(1.25rem,calc((100vw_-_64rem)/2_+_1rem))] sm:bottom-5",
    top: "top-[4.75rem] sm:top-20 sm:right-[max(1.25rem,calc((100vw_-_64rem)/2_+_1rem))]",
};

// The screen area the card would cover at `spot`, matching POSITION_CLASSES (12px gaps on phones; on wide screens
// SIDE from the edge, 20px from the bottom, 80px from the top).
function spotRect(spot: Position, width: number, height: number) {
    const wide = window.innerWidth >= 640;
    const side = Math.max(20, (window.innerWidth - 1024) / 2 + 16);
    const left = !wide ? 12 : spot === "bottom-left" ? side : window.innerWidth - side - width;
    const top = spot === "top" ? (wide ? 80 : 76) : window.innerHeight - (wide ? 20 : 12) - height;
    return { left, right: left + width, top, bottom: top + height };
}

// The demo's guide: a small card docked to the bottom of the screen (bottom right on wide screens). The control it's
// talking about gets an accent outline and is scrolled into view; if the card would cover it, the card moves to the
// top of the screen instead, and back again when it's clear.
export default function DemoTutorial({ mode, step }: { mode: "office" | "contractor"; step: Step | null }) {
    const storageKey = `praedium-tutorial-${mode}`;
    const cardRef = useRef<HTMLElement>(null);
    const [position, setPosition] = useState<Position>("bottom-right");
    // Phones start with the small pill (which names the step), so the card never sits over the page there; a tap
    // opens it. The demo only renders in the browser, so the screen width is known here.
    const [minimized, setMinimized] = useState(() => window.matchMedia("(max-width: 639px)").matches);
    const [dismissed, setDismissed] = useState(() => {
        try {
            return sessionStorage.getItem(storageKey) === "done";
        } catch {
            return false;
        }
    });
    const target = step?.target;
    const number = step?.number;

    useEffect(() => {
        if (dismissed || !target) return;
        let anchor: HTMLElement | null = null;
        let originalOutline = "";
        let originalOffset = "";
        const restore = () => {
            if (anchor) {
                anchor.style.outline = originalOutline;
                anchor.style.outlineOffset = originalOffset;
            }
        };
        const highlight = () => {
            const next = document.querySelector<HTMLElement>(target);
            if (!next || next === anchor) return;
            restore();
            anchor = next;
            originalOutline = anchor.style.outline;
            originalOffset = anchor.style.outlineOffset;
            anchor.style.outline = "2px solid var(--accent)";
            anchor.style.outlineOffset = "4px";
            const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            anchor.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
        };
        // Keeps the card off the control: the first spot (bottom right, then bottom left on wide screens, then the top)
        // where the card wouldn't cover it.
        let frame = 0;
        const place = () => {
            frame = 0;
            const card = cardRef.current;
            if (!card || !anchor) return;
            const a = anchor.getBoundingClientRect();
            const { width, height } = card.getBoundingClientRect();
            const free = (spot: Position) => {
                const r = spotRect(spot, width, height);
                return a.right <= r.left || a.left >= r.right || a.bottom <= r.top || a.top >= r.bottom;
            };
            const spots: Position[] =
                window.innerWidth >= 640 ? ["bottom-right", "bottom-left", "top"] : ["bottom-right", "top"];
            setPosition(spots.find(free) ?? "bottom-right");
        };
        const schedulePlace = () => {
            if (!frame) frame = requestAnimationFrame(place);
        };
        // The shared cards swap Add and Note buttons for forms; follow the active control.
        const observer = new MutationObserver(() => {
            highlight();
            schedulePlace();
        });
        const main = document.querySelector("main");
        if (main) observer.observe(main, { childList: true, subtree: true });
        highlight();
        schedulePlace();
        window.addEventListener("scroll", schedulePlace, { passive: true });
        window.addEventListener("resize", schedulePlace);
        return () => {
            restore();
            observer.disconnect();
            window.removeEventListener("scroll", schedulePlace);
            window.removeEventListener("resize", schedulePlace);
            if (frame) cancelAnimationFrame(frame);
        };
    }, [dismissed, target, number]);

    if (dismissed || !step) return null;

    // Minimized: a small pill in the corner, so nothing on the page is covered; tapping it brings the card back.
    if (minimized) {
        return (
            <button
                type="button"
                onClick={() => setMinimized(false)}
                aria-label={`Show the tutorial, step ${step.number} of 3: ${step.title}`}
                className="fixed right-3 bottom-3 z-50 inline-flex h-10 max-w-[calc(100vw-1.5rem)] items-center gap-2 rounded-full border border-accent/50 bg-surface px-4 text-sm font-medium text-foreground shadow-lg hover:cursor-pointer sm:right-[max(1.25rem,calc((100vw_-_64rem)/2_+_1rem))] sm:bottom-5"
            >
                <span className="shrink-0 text-accent">
                    Step {step.number}/3
                </span>
                <span className="truncate">{step.title}</span>
                <ChevronUpIcon />
            </button>
        );
    }

    return (
        <aside
            ref={cardRef}
            aria-label={`${mode === "office" ? "Office" : "Contractor"} tutorial`}
            className={`fixed inset-x-3 z-50 rounded-xl border border-accent/50 bg-surface p-3 text-foreground shadow-2xl sm:inset-x-auto sm:w-80 sm:p-4 ${POSITION_CLASSES[position]}`}
        >
            <button
                type="button"
                aria-label="Minimize the tutorial"
                title="Minimize"
                onClick={() => setMinimized(true)}
                className="absolute top-2 right-11 flex h-9 w-9 items-center justify-center rounded-md text-muted hover:cursor-pointer hover:bg-surface-hover hover:text-foreground"
            >
                <MinimizeIcon />
            </button>
            <button
                type="button"
                aria-label="Close the tutorial"
                className="absolute top-2 right-2 flex h-9 w-9 items-center justify-center rounded-md text-muted hover:cursor-pointer hover:bg-surface-hover hover:text-foreground"
                onClick={() => {
                    setDismissed(true);
                    try {
                        sessionStorage.setItem(storageKey, "done");
                    } catch {
                        /* Optional persistence. */
                    }
                }}
            >
                <XIcon size={16} />
            </button>
            <div role="status" aria-live="polite">
                <p className="pr-16 text-xs font-medium text-accent">
                    {mode === "office" ? "Office" : "Contractor"} tutorial · Step {step.number} of 3
                </p>
                <p className="mt-1 pr-16 text-sm font-semibold">{step.title}</p>
                <p className="mt-1 text-[0.8125rem] leading-snug text-muted sm:mt-1.5 sm:text-sm sm:leading-relaxed">
                    {step.text}
                </p>
            </div>
            <div className="mt-2.5 flex gap-1.5 max-sm:hidden sm:mt-3" aria-hidden>
                {[1, 2, 3].map((n) => (
                    <span key={n} className={`h-1 flex-1 rounded-full ${n <= step.number ? "bg-accent" : "bg-line"}`} />
                ))}
            </div>
        </aside>
    );
}
