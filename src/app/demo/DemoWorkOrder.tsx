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
import DetailList, { ContactLine, type Detail } from "@/components/DetailList";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import { Button } from "@/components/Button";
import { StatusBadge } from "@/components/StatusBadge";
import { ExternalIcon, InfoIcon, PlusIcon, RotateIcon } from "@/components/Icons";
import { inputClass } from "@/lib/defaults";
import { buttonClass, cardClass, cardTitleClass, noticeClass } from "@/lib/ui";

type Item = { id: string; description: string; priority: string; completed: boolean; note: string };
type Area = { id: string; name: string; items: Item[] };
type Demo = { areas: Area[]; completed: boolean; completionNotes: string };
const emptyDemo = (): Demo => ({ areas: [], completed: false, completionNotes: "" });
const DemoContext = createContext<{ demo: Demo; setDemo: Dispatch<SetStateAction<Demo>> } | null>(null);

// A ready-made job, for visitors who'd rather see a full work order than build one.
function exampleDemo(): Demo {
    const item = (description: string, priority = "MEDIUM"): Item => ({
        id: crypto.randomUUID(),
        description,
        priority,
        completed: false,
        note: "",
    });
    return {
        completed: false,
        completionNotes: "",
        areas: [
            {
                id: crypto.randomUUID(),
                name: "Kitchen",
                items: [
                    item("Fix the leak under the sink and replace the P-trap", "HIGH"),
                    item("Replace the garbage disposal"),
                ],
            },
            {
                id: crypto.randomUUID(),
                name: "Bathroom",
                items: [item("Recaulk the tub and shower surround"), item("Replace the exhaust fan", "LOW")],
            },
        ],
    };
}

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
        <p role="status" className="p-10 text-muted">
            Loading the demo…
        </p>
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
        // A first visit opens on the example job, so the value shows before anything is typed; "Start blank" empties it.
        return exampleDemo();
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
                      text: "Finished a job? Tap the item to mark it done. The office sees it right away.",
                  }
                : !items.some((item) => item.note.trim())
                  ? {
                        number: 2,
                        target: '[data-demo-guide="note-input"], [data-demo-guide="add-note"]',
                        title: "Leave a note for the office",
                        text: "Tap Add a note, describe what you did, then press Save note.",
                    }
                  : {
                        number: 3,
                        target: '[data-demo-guide="finish"]',
                        title: "Submit the completed work",
                        text: "Add final notes if you like, then mark the work order as completed and confirm.",
                    }
          : demo.areas.length === 0
            ? {
                  number: 1,
                  target: '[data-demo-guide="area"]',
                  title: "Add an area",
                  text: "Start with a room, such as Kitchen: type its name and press Add area. Or load the example.",
              }
            : items.length === 0
              ? {
                    number: 2,
                    target: '[data-demo-guide="item-input"], [data-demo-guide="add-item"]',
                    title: "Add a line item",
                    text: "Press Add item, describe the repair, choose a priority, then press Add item again.",
                }
              : {
                    number: 3,
                    target: '[data-demo-guide="contractor-link"]',
                    title: "See what your contractor gets",
                    text: "Press Open contractor view. Your work items come with you.",
                };
    const updateArea = (id: string, update: (area: Area) => Area) =>
        setDemo((current) => ({
            ...current,
            areas: current.areas.map((area) => (area.id === id ? update(area) : area)),
        }));
    // The contractor view is "Sent" until something is checked off, like the real thing.
    const status = demo.completed ? "COMPLETED" : contractor ? (done > 0 ? "IN_PROGRESS" : "SENT") : "DRAFT";
    // The same facts, labels and order as the real pages: the contractor page's Where / Tenant / Office, and the
    // office page's Property / Contractor / Tenant.
    const tenant: Detail = { label: "Tenant", value: "None. The house is vacant.", empty: true };
    const details: Detail[] = contractor
        ? [
              { label: "Where", value: "123 Main St", extra: <p>Hometown, SC 29999</p> },
              tenant,
              {
                  label: "Office",
                  value: "Oakridge Property Management",
                  extra: (
                      <>
                          <ContactLine href="tel:8645550100">(864) 555-0100</ContactLine>
                          <ContactLine href="mailto:office@oakridge.example">office@oakridge.example</ContactLine>
                      </>
                  ),
              },
          ]
        : [
              { label: "Property", value: "Main St House", extra: <p>123 Main St, Hometown, SC 29999</p> },
              {
                  label: "Contractor",
                  value: "Smith Plumbing Co",
                  extra: (
                      <>
                          <ContactLine href="tel:8645550011">(864) 555-0011</ContactLine>
                          <ContactLine href="mailto:smith@smithplumbing.example">smith@smithplumbing.example</ContactLine>
                      </>
                  ),
              },
              tenant,
          ];

    return (
        <div className="text-foreground">
            <header className="sticky top-0 z-40 border-b border-line bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/80">
                <nav aria-label="Demo" className="mx-auto flex h-16 max-w-5xl items-center gap-2 px-4">
                    <Link href="/" aria-label="Praedium home" className="mr-auto shrink-0 rounded">
                        <Logo className="h-6 w-auto" />
                    </Link>
                    <ThemeToggle />
                    <Link
                        href={contractor ? "/demo" : "/"}
                        className={buttonClass({ variant: "ghost", size: "sm", className: "max-sm:hidden" })}
                    >
                        {contractor ? "Office view" : "Home"}
                    </Link>
                    <Link href="/sign-up" className={buttonClass({ variant: "primary", size: "sm" })}>
                        Get started
                    </Link>
                </nav>
            </header>
            <main
                id="main"
                className={`mx-auto px-4 pt-6 pb-40 sm:pt-8 sm:pb-24 ${contractor ? "max-w-3xl" : "max-w-5xl"}`}
            >
                <div className={`${noticeClass.info} mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`}>
                    <p className="flex gap-2">
                        <InfoIcon size={16} className="mt-0.5 shrink-0 text-accent" />
                        <span>
                            <span className="font-medium text-foreground">
                                {contractor
                                    ? "This is what your contractor sees."
                                    : demo.areas.length > 0
                                      ? "This is an example work order."
                                      : "Try building a work order."}
                            </span>{" "}
                            {contractor
                                ? "Check off work, leave notes and finish the job. Nothing is sent to a real office."
                                : demo.areas.length > 0
                                  ? "Edit it, open the contractor view, or start blank and build your own. Nothing is saved or sent."
                                  : "Add areas and line items, then open the contractor view. Nothing is saved or sent."}
                        </span>
                    </p>
                    <div className="flex shrink-0 flex-wrap gap-2">
                        {demo.areas.length === 0 && (
                            <Button size="sm" variant="primary" onClick={() => setDemo(exampleDemo())}>
                                Load the example job
                            </Button>
                        )}
                        {contractor && (
                            <Link href="/demo" className={buttonClass({ size: "sm", className: "sm:hidden" })}>
                                Office view
                            </Link>
                        )}
                        {demo.areas.length > 0 &&
                            (contractor ? (
                                (done > 0 || demo.completed) && (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => {
                                            setDemo(exampleDemo());
                                            setConfirming(false);
                                        }}
                                    >
                                        <RotateIcon size={14} />
                                        Start over
                                    </Button>
                                )
                            ) : (
                                <Button
                                    size="sm"
                                    onClick={() => {
                                        setDemo(emptyDemo());
                                        setConfirming(false);
                                    }}
                                >
                                    Start blank
                                </Button>
                            ))}
                    </div>
                </div>

                <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-sm tabular-nums text-muted">#DEMO-1001</span>
                    <StatusBadge status={status} />
                    <span className="text-sm text-subtle">Due Oct 29, 2026</span>
                </div>
                <h1 className="text-2xl font-semibold tracking-tight sm:text-[1.75rem]">Property maintenance</h1>
                <div className="mt-3 mb-6 flex items-center gap-3">
                    {/* A draft with nothing done yet shows its size, not an empty progress bar, like the real page. */}
                    {!contractor && !demo.completed && done === 0 && items.length > 0 ? (
                        <span className="text-sm text-muted">
                            {demo.areas.length} {demo.areas.length === 1 ? "area" : "areas"} · {items.length}{" "}
                            {items.length === 1 ? "item" : "items"}
                        </span>
                    ) : items.length > 0 ? (
                        <>
                            <div
                                role="progressbar"
                                aria-label="Items done"
                                aria-valuemin={0}
                                aria-valuemax={items.length}
                                aria-valuenow={done}
                                className="h-1.5 flex-1 overflow-hidden rounded-full bg-line"
                            >
                                <div
                                    className="h-full rounded-full bg-success"
                                    style={{ width: `${(done / items.length) * 100}%` }}
                                />
                            </div>
                            <span className="shrink-0 text-sm tabular-nums text-muted">
                                {done} of {items.length} done
                            </span>
                        </>
                    ) : (
                        <span className="text-sm text-subtle">No items yet</span>
                    )}
                </div>

                {demo.completed && (
                    <section role="status" className={`${noticeClass.success} mb-6`}>
                        <h2 className="font-semibold text-foreground">Work order completed</h2>
                        <p className="mt-1 text-sm">
                            {contractor
                                ? "The office would be told right away."
                                : "The contractor finished. In the app, you'd review it and close it out."}
                        </p>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-muted">
                            {demo.completionNotes || "No completion notes."}
                        </p>
                        {contractor && (
                            <Link href="/demo" className={buttonClass({ size: "sm", className: "mt-3" })}>
                                Review it in the office view
                            </Link>
                        )}
                    </section>
                )}

                {/* The office view is laid out like the real work order page: the work on the left, Next step and
                    the details on the right. On phones: Next step, then the work, then the details. The contractor
                    view is one column, like theirs. */}
                <div
                    className={
                        contractor
                            ? ""
                            : "grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:grid-rows-[auto_1fr] lg:gap-x-8"
                    }
                >
                    {contractor ? (
                        <DetailList className="mb-6" details={details} />
                    ) : (
                        <>
                            <section
                                aria-labelledby="demo-next-title"
                                className={`${cardClass} p-4 sm:p-5 lg:col-start-2 lg:row-start-1`}
                            >
                                <h2 id="demo-next-title" className={cardTitleClass}>
                                    Next step
                                </h2>
                                <p className="mt-1.5 text-sm leading-relaxed text-secondary">
                                    {demo.completed
                                        ? "The contractor finished. In the app, you'd review the work and close it."
                                        : "In the app, sending this emails Smith Plumbing a link to it. Here, open their view yourself."}
                                </p>
                                <Link
                                    href="/demo/contractor"
                                    className={buttonClass({ variant: "primary", full: true, className: "mt-4" })}
                                    data-demo-guide="contractor-link"
                                    onClick={() => {
                                        try {
                                            sessionStorage.setItem("praedium-tutorial-office", "done");
                                        } catch {
                                            /* Optional persistence. */
                                        }
                                    }}
                                >
                                    <ExternalIcon />
                                    Open contractor view
                                </Link>
                            </section>
                            <DetailList
                                title="Details"
                                details={details}
                                className="lg:col-start-2 lg:row-start-2 max-lg:order-last"
                            />
                        </>
                    )}

                    <div className="min-w-0 lg:col-start-1 lg:row-span-2 lg:row-start-1">
                <section aria-label="Notes" className={`${cardClass} mb-8 p-4 sm:p-5`}>
                    <p className={cardTitleClass}>Notes {contractor ? "from the office" : "for the contractor"}</p>
                    <p className="mt-1.5 text-sm text-secondary">House is vacant. Lockbox is on the front door.</p>
                </section>

                <section aria-labelledby="demo-work-title">
                    <h2 id="demo-work-title" className="text-lg font-semibold">
                        {contractor ? "The work" : "Work"}
                    </h2>
                    {demo.areas.length === 0 && (
                        <div className="mt-4 rounded-xl border border-dashed border-line-strong/60 px-5 py-8 text-center">
                            <p className="text-sm font-medium text-foreground">
                                {contractor ? "No work items yet" : "Add the first area"}
                            </p>
                            <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
                                {contractor
                                    ? "The office adds the work. Load the example job at the top to try checking it off."
                                    : "Group the work by room, like Kitchen or Bathroom, then list what each one needs."}
                            </p>
                        </div>
                    )}
                    <ul className="mt-4 flex flex-col gap-4 empty:hidden">
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
                                building={!demo.completed && done === 0}
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
                    {/* Under the areas, as on the real work order page. */}
                    {!contractor && !demo.completed && (
                        <form
                            className="mt-4"
                            onSubmit={(event) => {
                                event.preventDefault();
                                if (!areaName.trim()) {
                                    document.getElementById("demo-area")?.focus();
                                    return;
                                }
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
                            <label htmlFor="demo-area" className="mb-1 block text-sm font-medium text-secondary">
                                {demo.areas.length === 0 ? "Area name" : "Add another area"}
                            </label>
                            <div className="flex flex-col gap-2 sm:flex-row">
                                <input
                                    id="demo-area"
                                    data-demo-guide="area"
                                    className={inputClass}
                                    placeholder="Kitchen, Bathroom, Yard…"
                                    value={areaName}
                                    maxLength={100}
                                    onChange={(event) => setAreaName(event.target.value)}
                                />
                                <Button type="submit">
                                    <PlusIcon />
                                    Add area
                                </Button>
                            </div>
                        </form>
                    )}
                </section>
                {contractor && !demo.completed && (
                    <section aria-labelledby="demo-finish-title" className={`${cardClass} mt-8 p-4 sm:p-5`}>
                        <h2 id="demo-finish-title" className="text-lg font-semibold">
                            Finish up
                        </h2>
                        <p className="mt-1 text-sm text-muted">
                            When the work is done, add any final notes and mark the work order as completed.
                        </p>
                        <label htmlFor="demo-completion" className="mt-4 mb-1 block text-sm font-medium text-secondary">
                            Notes for the office <span className="font-normal text-subtle">(optional)</span>
                        </label>
                        <textarea
                            id="demo-completion"
                            data-demo-guide="finish"
                            placeholder="Anything left to do, parts you used, follow-up needed"
                            className={inputClass}
                            rows={4}
                            maxLength={2000}
                            value={demo.completionNotes}
                            onChange={(event) =>
                                setDemo((current) => ({ ...current, completionNotes: event.target.value }))
                            }
                        />
                        {items.length - done > 0 && (
                            <p className="mt-3 text-sm text-warning">
                                {items.length - done} {items.length - done === 1 ? "item isn't" : "items aren't"}{" "}
                                checked off yet.
                            </p>
                        )}
                        <div className="mt-4">
                            {confirming ? (
                                <div className="rounded-lg border border-line-strong/70 bg-background/40 p-3">
                                    <p className="text-sm font-medium">Mark this work order as completed?</p>
                                    <div className="mt-3 grid grid-cols-2 gap-2">
                                        <Button onClick={() => setConfirming(false)}>Go back</Button>
                                        <Button
                                            variant="primary"
                                            autoFocus
                                            onClick={() => {
                                                setDemo((current) => ({ ...current, completed: true }));
                                                try {
                                                    sessionStorage.setItem("praedium-tutorial-contractor", "done");
                                                } catch {
                                                    /* Optional persistence. */
                                                }
                                                setConfirming(false);
                                                const reduced = window.matchMedia(
                                                    "(prefers-reduced-motion: reduce)",
                                                ).matches;
                                                window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
                                            }}
                                        >
                                            Yes, completed
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <Button
                                    variant="primary"
                                    size="lg"
                                    full
                                    disabled={items.length === 0}
                                    onClick={() => setConfirming(true)}
                                >
                                    Mark as completed
                                </Button>
                            )}
                        </div>
                    </section>
                )}
                    </div>
                </div>
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
    building,
    update,
    remove,
    move,
}: {
    area: Area;
    index: number;
    total: number;
    contractor: boolean;
    readOnly: boolean;
    // Nothing checked off yet: the office card shows item counts, like a real draft.
    building: boolean;
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
            building={building}
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
