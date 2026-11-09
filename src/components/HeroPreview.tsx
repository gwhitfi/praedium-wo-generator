import { CheckIcon } from "./Icons";

const ITEMS = [
    { text: "Shut off water and gas, confirm the leak", done: true },
    { text: "Drain and remove the old 50 gal heater", done: true },
    { text: "Install the new heater with expansion tank", done: true, badge: "High" },
    { text: "Replace gas flex line and sediment trap", done: false },
    { text: "Schedule the county inspection", done: false },
];

// The landing page's product picture: the contractor's work order on a phone, drawn with the app's own styles so it
// follows the theme, plus the update the office gets. Decorative; the text beside it says what it shows.
export default function HeroPreview(): React.ReactElement {
    const done = ITEMS.filter((item) => item.done).length;

    return (
        <div
            role="img"
            aria-label="A contractor's work order on a phone: three of five items checked off, and the office getting a notification"
            className="relative mx-auto w-full max-w-[22rem] select-none"
        >
            <div className="rounded-[2.25rem] border border-line-strong/60 bg-surface-hover/60 p-2.5 shadow-2xl shadow-black/20">
                <div className="overflow-hidden rounded-[1.75rem] border border-line bg-background">
                    <div className="flex items-center justify-between px-5 pt-4 pb-2 text-[10px] font-medium text-subtle">
                        <span>9:41</span>
                        <span className="h-1.5 w-12 rounded-full bg-line-strong/60" />
                        <span>100%</span>
                    </div>
                    <div className="px-5 pb-6">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-subtle">
                            Oakridge Property Mgmt · #2026-1028
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                            <span className="rounded-full border border-status-in-progress/50 px-2 py-0.5 text-[10px] font-medium text-status-in-progress">
                                In progress
                            </span>
                            <span className="text-[11px] text-subtle">Due Friday</span>
                        </div>
                        <p className="mt-1.5 text-base font-semibold leading-snug text-foreground">
                            Water heater replacement
                        </p>
                        <div className="mt-3 flex items-center gap-2">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                                <div
                                    className="h-full rounded-full bg-success"
                                    style={{ width: `${(done / ITEMS.length) * 100}%` }}
                                />
                            </div>
                            <span className="text-[11px] text-muted">
                                {done} of {ITEMS.length}
                            </span>
                        </div>
                        <div className="mt-4 rounded-xl border border-line bg-surface">
                            <p className="border-b border-line px-3 py-2 text-xs font-semibold text-foreground">
                                Garage
                            </p>
                            <ul className="divide-y divide-line">
                                {ITEMS.map((item) => (
                                    <li key={item.text} className="flex items-start gap-2.5 px-3 py-2.5">
                                        <span
                                            className={`mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 ${
                                                item.done
                                                    ? "border-success bg-success text-background"
                                                    : "border-line-strong"
                                            }`}
                                        >
                                            {item.done && <CheckIcon size={10} strokeWidth={3.5} />}
                                        </span>
                                        <span
                                            className={`text-xs leading-snug ${item.done ? "text-muted" : "text-foreground"}`}
                                        >
                                            {item.text}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div className="mt-4 rounded-lg bg-accent py-2.5 text-center text-xs font-semibold text-on-accent">
                            Mark as completed
                        </div>
                    </div>
                </div>
            </div>

            <div className="absolute -bottom-16 -left-2 w-64 rounded-xl border border-line bg-surface p-3 shadow-xl sm:-left-16">
                <div className="flex items-start gap-2.5">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent" />
                    <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-foreground">Water heater replacement</p>
                        <p className="mt-0.5 text-xs text-muted">Marcus Hill checked off &ldquo;Install the new heater&rdquo;</p>
                        <p className="mt-1 text-[10px] text-subtle">Just now</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
