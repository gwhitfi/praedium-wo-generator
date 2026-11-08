"use client";

import Link from "next/link";
import DemoTutorial from "./DemoTutorial";
import {
    createContext,
    useContext,
    useEffect,
    useState,
    useSyncExternalStore,
    type Dispatch,
    type SetStateAction,
} from "react";
import SpaceCard from "@/app/(app)/work-orders/[id]/SpaceCard";
import ContractorSpaceCard from "@/app/(public)/wo/[token]/ContractorSpaceCard";
import InfoCard from "@/components/InfoCard";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import { inputClass } from "@/lib/defaults";

type Item = { id: string; description: string; priority: string; completed: boolean; note: string };
type Area = { id: string; name: string; items: Item[] };
type Demo = { areas: Area[]; completed: boolean; completionNotes: string };
const emptyDemo = (): Demo => ({ areas: [], completed: false, completionNotes: "" });
const DemoContext = createContext<{ demo: Demo; setDemo: Dispatch<SetStateAction<Demo>> } | null>(null);
const button =
    "rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40";
const secondary = "rounded-md border border-line-strong px-4 py-2 text-sm hover:bg-surface-hover disabled:opacity-40";

const subscribe = () => () => {};

export function DemoProvider({ children }: { children: React.ReactNode }) {
    const ready = useSyncExternalStore(
        subscribe,
        () => true,
        () => false,
    );
    return ready ? (
        <BrowserDemoProvider>{children}</BrowserDemoProvider>
    ) : (
        <p className="p-10 text-muted">Loading demo...</p>
    );
}

function BrowserDemoProvider({ children }: { children: React.ReactNode }) {
    const [demo, setDemo] = useState<Demo>(() => {
        try {
            const saved = sessionStorage.getItem("praedium-demo-v1");
            if (saved) {
                const value = JSON.parse(saved) as Demo;
                if (
                    Array.isArray(value.areas) &&
                    typeof value.completed === "boolean" &&
                    typeof value.completionNotes === "string" &&
                    value.areas.every(
                        (a) =>
                            typeof a.id === "string" &&
                            typeof a.name === "string" &&
                            Array.isArray(a.items) &&
                            a.items.every(
                                (i) =>
                                    typeof i.id === "string" &&
                                    typeof i.description === "string" &&
                                    typeof i.priority === "string" &&
                                    typeof i.completed === "boolean" &&
                                    typeof i.note === "string",
                            ),
                    )
                )
                    return value;
            }
        } catch {
            /* Start fresh if browser storage is unavailable or invalid. */
        }
        return emptyDemo();
    });
    useEffect(() => {
        {
            try {
                sessionStorage.setItem("praedium-demo-v1", JSON.stringify(demo));
            } catch {
                /* The demo still works in memory. */
            }
        }
    }, [demo]);
    return <DemoContext.Provider value={{ demo, setDemo }}>{children}</DemoContext.Provider>;
}

export default function DemoWorkOrder({ contractor = false }: { contractor?: boolean }) {
    const context = useContext(DemoContext);
    if (!context) throw new Error("DemoProvider is required");
    const { demo, setDemo } = context;
    const [areaName, setAreaName] = useState("");
    const [confirming, setConfirming] = useState(false);
    const items = demo.areas.flatMap((area) => area.items);
    const done = items.filter((item) => item.completed).length;
    const tutorialStep = demo.completed
        ? null
        : contractor
          ? items.length === 0
              ? null
              : done === 0
                ? {
                      number: 1,
                      target: '[data-demo-guide="check-item"]',
                      title: "Check off the repair",
                      text: "Finished the work? Click the checkbox beside a line item to mark it done.",
                  }
                : !items.some((item) => item.note.trim())
                  ? {
                        number: 2,
                        target: '[data-demo-guide="note-input"], [data-demo-guide="add-note"]',
                        title: "Leave a note for the office",
                        text: "Click + Note, describe what you did, then press Enter or Save note.",
                    }
                  : {
                        number: 3,
                        target: '[data-demo-guide="finish"]',
                        title: "Submit the completed work",
                        text: "Add final notes if you like, then mark the work order complete and confirm.",
                    }
          : demo.areas.length === 0
            ? {
                  number: 1,
                  target: '[data-demo-guide="area"]',
                  title: "Add an area",
                  text: "Start with a room or space, such as Kitchen. Enter its name, then click Add area.",
              }
            : items.length === 0
              ? {
                    number: 2,
                    target: '[data-demo-guide="item-input"], [data-demo-guide="add-item"]',
                    title: "Add a line item",
                    text: "Click + Add line item, describe the repair, choose a priority, then click Add.",
                }
              : {
                    number: 3,
                    target: '[data-demo-guide="contractor-link"]',
                    title: "Try the contractor view",
                    text: "Click Open to see what your contractor receives. Your work items will come with you.",
                };
    const updateArea = (id: string, update: (area: Area) => Area) =>
        setDemo((current) => ({
            ...current,
            areas: current.areas.map((area) => (area.id === id ? update(area) : area)),
        }));

    return (
        <div className="text-foreground">
            <header className="border-b border-line">
                <nav className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-4">
                    <Link href="/" aria-label="Praedium home">
                        <Logo className="h-7 w-auto" />
                    </Link>
                    <div className="flex items-center gap-4">
                        <ThemeToggle />
                        <Link href={contractor ? "/demo" : "/"} className="text-sm text-muted hover:text-foreground">
                            {contractor ? "Office view" : "Back to home"}
                        </Link>
                        <Link href="/sign-up" className={button}>
                            Get started
                        </Link>
                    </div>
                </nav>
            </header>
            <main className="mx-auto max-w-3xl px-4 py-10">
                <div className="mb-8 rounded-lg border border-accent/30 bg-accent/5 p-4 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="font-medium text-accent">{contractor ? "Contractor demo" : "Try a work order"}</p>
                        <button
                            className="text-muted underline hover:text-foreground"
                            onClick={() => {
                                setDemo(emptyDemo());
                                setConfirming(false);
                            }}
                        >
                            Start over
                        </button>
                    </div>
                    <p className="mt-2 text-muted">
                        {contractor
                            ? "Check off work, save notes, and submit completion. Nothing is sent to a real office."
                            : "Add spaces and line items, then open the contractor link to try the other side. Property and contact details are sample data."}
                    </p>
                </div>
                <p className="mb-2 text-xs uppercase tracking-wide text-subtle">
                    Oakridge Property Management · #DEMO-1001
                </p>
                <div className="mb-2 flex flex-wrap items-center gap-3 text-sm text-subtle">
                    <span className="rounded-full border border-accent/40 px-2 py-0.5 text-xs text-accent">
                        {demo.completed ? "Completed" : contractor ? "In progress" : "Draft"}
                    </span>
                    <span>Due by Oct 29, 2026</span>
                    <span>
                        {done} of {items.length} items done
                    </span>
                </div>
                <h1 className="mb-6 text-2xl font-semibold">Property maintenance</h1>
                <div className="mb-8 grid gap-4 sm:grid-cols-3">
                    <InfoCard label="Property" title="Main St House">
                        <p>123 Main St</p>
                        <p>Hometown, SC 29999</p>
                    </InfoCard>
                    {contractor ? (
                        <InfoCard label="Tenant" title="Not assigned">
                            <p>House is vacant.</p>
                        </InfoCard>
                    ) : (
                        <InfoCard label="Contractor" title="Smith Plumbing Co">
                            <p>(864) 555-0011</p>
                            <p>smith@smithplumbing.example</p>
                        </InfoCard>
                    )}
                    {contractor ? (
                        <InfoCard label="Office" title="Oakridge Property Management">
                            <p>(864) 555-0100</p>
                            <p>office@oakridge.example</p>
                        </InfoCard>
                    ) : (
                        <InfoCard label="Tenant" title="Not assigned">
                            <p>House is vacant.</p>
                        </InfoCard>
                    )}
                </div>
                {demo.completed && (
                    <section
                        role="status"
                        className="mb-8 rounded-lg border border-status-completed/40 bg-status-completed/10 p-4"
                    >
                        <h2 className="font-medium text-status-completed">Work order completed</h2>
                        <p className="mt-2 text-sm">Your demo completion has been submitted.</p>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-muted">
                            {demo.completionNotes || "No completion notes."}
                        </p>
                        {contractor && (
                            <Link href="/demo" className="mt-3 inline-block text-sm text-accent underline">
                                Review in office view
                            </Link>
                        )}
                    </section>
                )}
                {!contractor && (
                    <section className="mb-8">
                        <h2 className="mb-2 text-xs uppercase tracking-wide text-subtle">Contractor link</h2>
                        <div className="flex items-center gap-3">
                            <code className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-sm">
                                /demo/contractor
                            </code>
                            <Link
                                href="/demo/contractor"
                                className={secondary}
                                data-demo-guide="contractor-link"
                                onClick={() => {
                                    try {
                                        sessionStorage.setItem("praedium-tutorial-office", "done");
                                    } catch {
                                        /* Optional persistence. */
                                    }
                                }}
                            >
                                Open
                            </Link>
                        </div>
                    </section>
                )}
                <div className="mb-6 text-sm text-muted">
                    <p className="text-xs uppercase tracking-wide text-subtle">Notes</p>
                    <p className="mt-1">House is vacant. Lockbox is on the front door.</p>
                </div>
                <section className="border-t border-line pt-6">
                    <h2 className="text-lg font-semibold">{contractor ? "Work items" : "Areas"}</h2>
                    {!contractor && !demo.completed && (
                        <form
                            className="mt-4 flex flex-col gap-2 sm:flex-row"
                            onSubmit={(event) => {
                                event.preventDefault();
                                if (!areaName.trim()) return;
                                setDemo((current) => ({
                                    ...current,
                                    areas: [
                                        ...current.areas,
                                        { id: crypto.randomUUID(), name: areaName.trim(), items: [] },
                                    ],
                                }));
                                setAreaName("");
                            }}
                        >
                            <input
                                data-demo-guide="area"
                                aria-label="Area name"
                                className={inputClass}
                                placeholder="Area name (Bathroom, Kitchen, Yard…)"
                                value={areaName}
                                maxLength={100}
                                onChange={(event) => setAreaName(event.target.value)}
                                required
                            />
                            <button className={`${secondary} shrink-0`} disabled={!areaName.trim()}>
                                Add area
                            </button>
                        </form>
                    )}
                    {demo.areas.length === 0 && (
                        <p className="my-6 text-sm text-subtle">
                            {contractor ? (
                                <>
                                    No work items yet.{" "}
                                    <Link href="/demo" className="text-accent underline">
                                        Add areas and line items in the office view.
                                    </Link>
                                </>
                            ) : (
                                "No areas yet. Add a space above, then describe the work it needs."
                            )}
                        </p>
                    )}
                    <ul className="mt-4 space-y-4">
                        {demo.areas.map((area, index) => (
                            <DemoArea
                                key={area.id}
                                area={area}
                                index={index}
                                total={demo.areas.length}
                                move={(direction) =>
                                    setDemo((current) => ({
                                        ...current,
                                        areas: moveEntry(current.areas, area.id, direction),
                                    }))
                                }
                                contractor={contractor}
                                readOnly={demo.completed}
                                update={(update) => updateArea(area.id, update)}
                                remove={() =>
                                    setDemo((current) => ({
                                        ...current,
                                        areas: current.areas.filter((a) => a.id !== area.id),
                                    }))
                                }
                            />
                        ))}
                    </ul>
                </section>
                {contractor && !demo.completed && (
                    <section className="mt-8 border-t border-line pt-6">
                        <h2 className="text-lg font-semibold">Finish up</h2>
                        <p className="mb-4 mt-1 text-sm text-subtle">
                            Add any final notes for the office, then mark the work order as completed.
                        </p>
                        <textarea
                            data-demo-guide="finish"
                            aria-label="Completion notes"
                            placeholder="Completion notes (optional)"
                            className={inputClass}
                            rows={4}
                            maxLength={2000}
                            value={demo.completionNotes}
                            onChange={(event) =>
                                setDemo((current) => ({ ...current, completionNotes: event.target.value }))
                            }
                        />
                        {items.length - done > 0 && (
                            <p className="mt-2 text-sm text-warning">
                                {items.length - done} items are not checked off.
                            </p>
                        )}
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                            {confirming ? (
                                <>
                                    <span className="text-sm">Mark this work order as completed?</span>
                                    <button
                                        className={button}
                                        onClick={() => {
                                            setDemo((current) => ({ ...current, completed: true }));
                                            try {
                                                sessionStorage.setItem("praedium-tutorial-contractor", "done");
                                            } catch {
                                                /* Optional persistence. */
                                            }
                                            setConfirming(false);
                                            window.scrollTo({ top: 0, behavior: "smooth" });
                                        }}
                                    >
                                        Yes, complete
                                    </button>
                                    <button className={secondary} onClick={() => setConfirming(false)}>
                                        Go back
                                    </button>
                                </>
                            ) : (
                                <button
                                    className={button}
                                    disabled={items.length === 0}
                                    onClick={() => setConfirming(true)}
                                >
                                    Mark as completed
                                </button>
                            )}
                        </div>
                    </section>
                )}
                {!contractor && (
                    <div className="mt-8 border-t border-line pt-6">
                        <button disabled className={button}>
                            Send by email
                        </button>
                        <p className="mt-2 text-sm text-subtle">
                            Email is disabled in the demo. Use the contractor link above to continue.
                        </p>
                    </div>
                )}
            </main>
            <DemoTutorial
                key={contractor ? "contractor" : "office"}
                mode={contractor ? "contractor" : "office"}
                step={tutorialStep}
            />
        </div>
    );
}

function moveEntry<T extends { id: string }>(entries: T[], id: string, direction: "up" | "down"): T[] {
    const index = entries.findIndex((entry) => entry.id === id);
    const target = index + (direction === "up" ? -1 : 1);
    if (index < 0 || target < 0 || target >= entries.length) return entries;
    const result = [...entries];
    [result[index], result[target]] = [result[target], result[index]];
    return result;
}

function DemoArea({
    area,
    index,
    total,
    contractor,
    readOnly,
    update,
    remove,
    move,
}: {
    area: Area;
    index: number;
    total: number;
    contractor: boolean;
    readOnly: boolean;
    update: (fn: (area: Area) => Area) => void;
    remove: () => void;
    move: (direction: "up" | "down") => void;
}) {
    const row = {
        id: area.id,
        name: area.name,
        lineItems: area.items.map((item) => ({
            ...item,
            // Keep existing browser demo drafts compatible with the real priority values.
            priority: item.priority === "Normal" ? "MEDIUM" : item.priority.toUpperCase(),
            completedAt: null,
            contractorNotes: item.note || null,
            attachments: [],
        })),
    };
    if (contractor) {
        return (
            <ContractorSpaceCard
                token="demo"
                area={row}
                readOnly={readOnly}
                actions={{
                    toggleLineItem: async (_token, id) =>
                        update((current) => ({
                            ...current,
                            items: current.items.map((item) =>
                                item.id === id ? { ...item, completed: !item.completed } : item,
                            ),
                        })),
                    saveLineItemNote: async (_token, id, note) =>
                        update((current) => ({
                            ...current,
                            items: current.items.map((item) =>
                                item.id === id ? { ...item, note: note.trim() } : item,
                            ),
                        })),
                }}
            />
        );
    }
    return (
        <SpaceCard
            area={row}
            index={index}
            total={total}
            busy={false}
            readOnly={readOnly}
            showPhotos={false}
            onMove={(_id, direction) => move(direction)}
            onRemove={remove}
            onRename={(_id, name) => update((current) => ({ ...current, name }))}
            actions={{
                addLineItem: async (_id, description, priority) =>
                    update((current) => ({
                        ...current,
                        items: [
                            ...current.items,
                            { id: crypto.randomUUID(), description, priority, completed: false, note: "" },
                        ],
                    })),
                removeLineItem: async (id) =>
                    update((current) => ({ ...current, items: current.items.filter((item) => item.id !== id) })),
                moveLineItem: async (id, direction) =>
                    update((current) => ({ ...current, items: moveEntry(current.items, id, direction) })),
                updateLineItem: async (id, description, priority) =>
                    update((current) => ({
                        ...current,
                        items: current.items.map((item) =>
                            item.id === id ? { ...item, description, priority } : item,
                        ),
                    })),
            }}
        />
    );
}
