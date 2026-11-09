"use client";

import { useState } from "react";
import { CheckIcon, LinkIcon, SendIcon } from "./Icons";

const STEPS = [
    {
        title: "Add a property",
        description: "Save the address and its units once, so the next repair is quick to write up.",
    },
    {
        title: "Add a contractor",
        description: "Keep each contractor's phone and email in one place. Star the ones you use most.",
    },
    {
        title: "Create and send a work order",
        description: "List the work room by room, set a due date, and email your contractor a link.",
    },
    {
        title: "Follow the work to the finish",
        description: "They check items off from their phone. You see it right away, review it and close it out.",
    },
];

// The landing page's walkthrough: the four steps as a list beside a picture of that step in the app. The pictures
// are drawn with the app's own styles, so they're sharp, readable and follow light and dark mode.
export default function HowItWorks(): React.ReactElement {
    const [index, setIndex] = useState(0);

    return (
        <section aria-labelledby="how-it-works-title" className="mx-auto max-w-5xl px-4 py-20 sm:py-24">
            <p className="text-sm font-semibold text-accent">How it works</p>
            <h2 id="how-it-works-title" className="mt-2 max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">
                From a leaky faucet to a closed job in four steps
            </h2>

            <div className="mt-10 grid gap-8 lg:grid-cols-[19rem_minmax(0,1fr)] lg:items-start">
                <ol className="flex flex-col gap-2">
                    {STEPS.map((step, i) => {
                        const active = i === index;
                        return (
                            <li key={step.title}>
                                <button
                                    type="button"
                                    onClick={() => setIndex(i)}
                                    aria-current={active ? "step" : undefined}
                                    aria-controls="how-it-works-preview"
                                    className={`flex w-full gap-3 rounded-xl border p-4 text-left transition-colors hover:cursor-pointer ${
                                        active
                                            ? "border-accent/50 bg-accent/[0.07]"
                                            : "border-transparent hover:border-line hover:bg-surface"
                                    }`}
                                >
                                    <span
                                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                                            active ? "bg-accent text-on-accent" : "bg-surface-hover text-muted"
                                        }`}
                                    >
                                        {i + 1}
                                    </span>
                                    <span>
                                        <span
                                            className={`block font-medium ${active ? "text-foreground" : "text-secondary"}`}
                                        >
                                            {step.title}
                                        </span>
                                        <span className="mt-1 block text-sm text-muted">
                                            {step.description}
                                        </span>
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ol>

                <figure
                    id="how-it-works-preview"
                    aria-live="polite"
                    className="overflow-hidden rounded-xl border border-line bg-background shadow-xl shadow-black/10"
                >
                    <div className="flex items-center gap-1.5 border-b border-line bg-surface-hover/50 px-4 py-2.5">
                        <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-line-strong" />
                        <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-line-strong" />
                        <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-line-strong" />
                        <figcaption className="ml-3 truncate text-xs text-subtle">
                            Step {index + 1} of {STEPS.length}: {STEPS[index].title}
                        </figcaption>
                    </div>
                    <div className="min-h-[22rem] p-5 sm:p-8" aria-hidden>
                        {index === 0 && <PropertyStep />}
                        {index === 1 && <ContractorStep />}
                        {index === 2 && <WorkOrderStep />}
                        {index === 3 && <FinishStep />}
                    </div>
                </figure>
            </div>
        </section>
    );
}

// The small building blocks of the step pictures.
const card = "rounded-xl border border-line bg-surface";
const label = "text-[11px] font-medium text-muted";
const input = "mt-1 rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-foreground";

function PropertyStep() {
    return (
        <div className={`${card} mx-auto max-w-md p-5`}>
            <p className="text-base font-semibold text-foreground">New property</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_8rem]">
                <div>
                    <p className={label}>Name</p>
                    <p className={input}>Pelham Court</p>
                </div>
                <div>
                    <p className={label}>Type</p>
                    <p className={input}>Apartment</p>
                </div>
            </div>
            <div className="mt-3">
                <p className={label}>Street address</p>
                <p className={input}>300 Pelham Ct, Greenville, SC</p>
            </div>
            <p className={`${label} mt-4`}>Units</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
                {["Unit 1", "Unit 2", "Unit 3", "Unit 4"].map((unit) => (
                    <span key={unit} className="rounded-full border border-line-strong px-2.5 py-0.5 text-xs text-secondary">
                        {unit}
                    </span>
                ))}
            </div>
            <div className="mt-5 flex justify-end">
                <span className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent">Add property</span>
            </div>
        </div>
    );
}

function ContractorStep() {
    const rows = [
        { name: "Hill Plumbing", person: "Marcus Hill", star: true },
        { name: "Upstate Electric", person: "Dana Reyes", star: true },
        { name: "Fresh Coat Painting", person: "Keisha Grant", star: false },
    ];
    return (
        <div className="mx-auto max-w-md">
            <div className={`${card} p-5`}>
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <p className="text-base font-semibold text-foreground">Hill Plumbing ★</p>
                        <p className="text-sm text-muted">Marcus Hill · Contractor</p>
                    </div>
                    <span className="rounded-full border border-line-strong px-2 py-0.5 text-xs text-muted">
                        2 open
                    </span>
                </div>
                <div className="mt-4 grid gap-1 text-sm">
                    <p className="text-secondary underline decoration-line-strong underline-offset-2">(864) 555-0102</p>
                    <p className="text-secondary underline decoration-line-strong underline-offset-2">
                        marcus@hillplumbing.example
                    </p>
                </div>
            </div>
            <div className={`${card} mt-4 divide-y divide-line`}>
                {rows.map((row) => (
                    <div key={row.name} className="flex items-center justify-between px-4 py-2.5 text-sm">
                        <span className="font-medium text-foreground">
                            {row.name}
                            {row.star && <span className="ml-1.5 text-secondary">★</span>}
                        </span>
                        <span className="text-muted">{row.person}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function WorkOrderStep() {
    return (
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_14rem]">
            <div>
                <p className="text-xs text-muted">#2026-1024 · Draft</p>
                <p className="mt-1 text-lg font-semibold text-foreground">Leak under kitchen sink</p>
                <p className="text-sm text-muted">812 Augusta St, Unit A · Hill Plumbing</p>
                <div className={`${card} mt-4`}>
                    <p className="border-b border-line px-4 py-2.5 text-sm font-semibold text-foreground">Kitchen</p>
                    {[
                        { text: "Replace the P-trap and supply lines", badge: "High" },
                        { text: "Check the dishwasher drain connection", badge: null },
                        { text: "Replace water-damaged cabinet floor", badge: null },
                    ].map((item) => (
                        <div key={item.text} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
                            <span className="min-w-0 flex-1 text-sm text-foreground">{item.text}</span>
                            {item.badge && (
                                <span className="rounded-full border border-priority-high/60 px-2 py-0.5 text-[11px] font-medium text-priority-high">
                                    {item.badge}
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            </div>
            <div className={`${card} self-start p-4`}>
                <p className="text-[11px] font-medium uppercase tracking-wide text-subtle">Next step</p>
                <p className="mt-1.5 text-sm text-secondary">Ready to send to Marcus Hill.</p>
                <p className="mt-3 flex items-center justify-center gap-2 rounded-md bg-accent py-2 text-sm font-medium text-on-accent">
                    <SendIcon size={14} />
                    Send by email
                </p>
                <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
                    <LinkIcon size={12} />
                    They get a link. No app needed.
                </p>
            </div>
        </div>
    );
}

function FinishStep() {
    const items = [
        { text: "Replace the P-trap and supply lines", done: true },
        { text: "Check the dishwasher drain connection", done: true },
        { text: "Replace water-damaged cabinet floor", done: true },
    ];
    return (
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_14rem]">
            <div>
                <p className="text-xs text-muted">#2026-1024 · Completed</p>
                <p className="mt-1 text-lg font-semibold text-foreground">Leak under kitchen sink</p>
                <div className="mt-3 flex items-center gap-3">
                    <div className="h-1.5 flex-1 rounded-full bg-success" />
                    <span className="text-sm text-muted">3 of 3 done</span>
                </div>
                <div className={`${card} mt-4`}>
                    {items.map((item) => (
                        <div key={item.text} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-success/15 text-success">
                                <CheckIcon size={10} strokeWidth={3} />
                            </span>
                            <span className="min-w-0 flex-1 text-sm text-muted">{item.text}</span>
                            <span className="text-xs font-medium text-success">Done Nov 6</span>
                        </div>
                    ))}
                </div>
                <p className="mt-3 rounded-md border-l-2 border-accent/50 bg-surface-hover/50 px-3 py-2 text-sm text-secondary">
                    <span className="block text-xs text-muted">Contractor note</span>
                    Cabinet floor swapped for moisture-resistant board.
                </p>
            </div>
            <div className={`${card} self-start p-4`}>
                <p className="text-[11px] font-medium uppercase tracking-wide text-subtle">Next step</p>
                <p className="mt-1.5 text-sm text-secondary">The work is marked complete. Review it, then close it out.</p>
                <p className="mt-3 rounded-md bg-accent py-2 text-center text-sm font-medium text-on-accent">
                    Close work order
                </p>
            </div>
        </div>
    );
}
