import { PriorityBadge, StatusBadge } from "./StatusBadge";
import { AlertIcon, CheckIcon } from "./Icons";
import { FoxDispatch } from "./FoxMarks";

// The landing page's feature section: three large pictures of the real app (dashboard, a work order, notifications),
// each beside what it does. Drawn with the app's own styles, so they follow light and dark mode and stay sharp.

type Row = {
    eyebrow: string;
    // Drawn beside the eyebrow.
    icon?: React.ReactElement;
    title: string;
    body: string;
    points: string[];
    picture: React.ReactElement;
    caption: string;
};

const ROWS: Row[] = [
    {
        eyebrow: "Dashboard",
        title: "See what needs your attention",
        body: "Open the app and see which work orders are still open, what's finished and waiting for your review, and what's past due.",
        points: [
            "Easily see overdue work flagged in red",
            "Search by job, contact, and property",
            "Your properties, units and tenants on file",
        ],
        picture: <DashboardPicture />,
        caption:
            "The dashboard: counts of drafts, active, to-review and overdue work orders, and a list of the ones that need attention.",
    },
    {
        eyebrow: "Work orders",
        title: "See the whole job on one page",
        body: "List the work by area, with a priority and photos for each item. The page shows you what to do next.",
        points: [
            "A link for the contractor, no app or account needed",
            "Print or save as PDF for contractors who need it",
            "Optional: Email the tenant when it's sent",
        ],
        picture: <WorkOrderPicture />,
        caption: "Work order showing room-by-room tasks, progress, and what to do next.",
    },
    {
        eyebrow: "Updates",
        title: "Receive notifications on changes",
        body: "Get notifications when something happens on a work order, such as a contractor opening the link or marking the job as completed.",
        points: ["Choose which updates you are sent"],
        picture: <UpdatesPicture />,
        caption: "Notifications: a contractor checked off items and finished a job.",
    },
    {
        eyebrow: "Fox Bot (AI)",
        icon: <FoxDispatch className="h-7 w-7" />,
        title: "Describe the job and Fox Bot drafts it",
        body: "Type the job in your own words, with the address, the contractor and what needs doing. Fox Bot turns it into a draft work order, and you review it before anything is created.",
        points: [
            "Optional: you choose whether to turn it on",
            "Connect your own AI assistant, like Claude or Grok Bot, through our MCP server",
            "An admin creates the API key in Settings, and you can revoke it any time",
        ],
        picture: <FoxBotPicture />,
        caption: "Fox Bot: a typed description of a job, and the draft work order it produces.",
    },
];

export default function ProductShowcase(): React.ReactElement {
    return (
        <section aria-labelledby="features-title" className="border-t border-line">
            <div className="mx-auto max-w-5xl px-4 py-20 sm:py-24">
                <p className="text-sm font-semibold text-accent-ink">Features</p>
                <h2 id="features-title" className="mt-2 max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">
                    What it looks like day to day
                </h2>
                <div className="mt-14 flex flex-col gap-20">
                    {ROWS.map((row, i) => (
                        <div
                            key={row.title}
                            // Text and picture swap sides on every other row; the picture always gets the wider column.
                            className={`grid items-center gap-8 lg:gap-12 ${
                                i % 2 === 1
                                    ? "lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]"
                                    : "lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
                            }`}
                        >
                            <div className={i % 2 === 1 ? "lg:order-2" : ""}>
                                <p className="flex items-center gap-2 text-sm font-medium text-muted">
                                    {row.icon}
                                    {row.eyebrow}
                                </p>
                                <h3 className="mt-1 text-2xl font-semibold tracking-tight">{row.title}</h3>
                                <p className="mt-3 leading-relaxed text-muted">{row.body}</p>
                                <ul className="mt-5 flex flex-col gap-2 text-sm text-secondary">
                                    {row.points.map((point) => (
                                        <li key={point} className="flex items-start gap-2">
                                            <CheckIcon size={15} className="mt-0.5 shrink-0 text-accent-ink" />
                                            {point}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            <figure className="overflow-hidden rounded-xl border border-line bg-background shadow-xl shadow-black/10">
                                <div aria-hidden className="flex items-center gap-1.5 border-b border-line bg-surface-hover/50 px-4 py-2.5">
                                    <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
                                    <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
                                    <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
                                </div>
                                <div aria-hidden className="p-4 sm:p-6">
                                    {row.picture}
                                </div>
                                <figcaption className="sr-only">{row.caption}</figcaption>
                            </figure>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

const card = "rounded-lg border border-line bg-surface";

function DashboardPicture() {
    const tiles = [
        { label: "Drafts", value: 12, dot: "bg-status-sent" },
        { label: "Active", value: 9, dot: "bg-status-in-progress" },
        { label: "To review", value: 3, dot: "bg-status-completed" },
        { label: "Overdue", value: 2, dot: "bg-danger", danger: true },
    ];
    const rows = [
        { job: "2026-1024", title: "Leak under kitchen sink", place: "812 Augusta St, Unit A", status: "COMPLETED", due: "Nov 6" },
        { job: "2026-1021", title: "Bathroom exhaust fan", place: "620 N Main St, Unit 201", status: "IN_PROGRESS", due: "Overdue", overdue: true },
        { job: "2026-1026", title: "Fall grounds cleanup", place: "300 Pelham Ct", status: "SENT", due: "Nov 18" },
    ];
    return (
        <div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {tiles.map((tile) => (
                    <div key={tile.label} className={`${card} p-3`}>
                        <p className="flex items-center gap-1.5 text-xs text-muted">
                            <span className={`h-1.5 w-1.5 rounded-full ${tile.dot}`} />
                            {tile.label}
                        </p>
                        <p className={`mt-1 text-2xl font-semibold ${tile.danger ? "text-danger" : "text-foreground"}`}>
                            {tile.value}
                        </p>
                    </div>
                ))}
            </div>
            <p className="mt-5 mb-2 text-sm font-semibold text-foreground">Needs attention</p>
            <div className={`${card} divide-y divide-line`}>
                {rows.map((row) => (
                    <div key={row.job} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                        <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-foreground">{row.title}</p>
                            <p className="truncate text-xs text-muted">
                                #{row.job} · {row.place}
                            </p>
                        </div>
                        <StatusBadge status={row.status} className="max-sm:hidden" />
                        <span
                            className={`w-16 shrink-0 text-right text-xs ${row.overdue ? "font-medium text-danger" : "text-muted"}`}
                        >
                            {row.due}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function WorkOrderPicture() {
    const items = [
        { text: "Patch and sand all nail holes", done: true },
        { text: "Paint walls, two coats", done: true },
        { text: "Paint baseboards and door casings", done: false, high: true },
    ];
    return (
        <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                #2026-1022 <StatusBadge status="IN_PROGRESS" />
                <span>Due Nov 12</span>
            </div>
            <p className="mt-2 text-lg font-semibold text-foreground">Repaint between leases, Unit A2</p>
            <p className="text-xs font-medium text-secondary">College Ave Condos · Keisha Grant</p>
            <div className="mt-3 flex items-center gap-2">
                <div className="h-1.5 flex-1 rounded-full bg-line">
                    <div className="h-full w-2/3 rounded-full bg-success" />
                </div>
                <span className="text-xs text-muted">2 of 3 done</span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]">
                <div className={card}>
                    <p className="rounded-t-lg border-b border-line bg-surface-hover/40 px-3 py-2 text-sm font-semibold text-foreground">
                        Living room
                    </p>
                    <ul className="divide-y divide-line px-3">
                        {items.map((item) => (
                            <li key={item.text} className="flex items-start gap-2.5 py-2.5 text-sm">
                                <span
                                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded ${
                                        item.done ? "bg-success/15 text-success" : ""
                                    }`}
                                >
                                    {item.done ? (
                                        <CheckIcon size={10} strokeWidth={3} />
                                    ) : (
                                        <span className="h-0.5 w-2 rounded-full bg-line-strong" />
                                    )}
                                </span>
                                <span className="min-w-0">
                                    <span className={item.done ? "text-muted" : "text-foreground"}>{item.text}</span>
                                    {item.high && (
                                        <span className="mt-1 flex">
                                            <PriorityBadge priority="HIGH" />
                                        </span>
                                    )}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
                <div className={`${card} h-fit p-3`}>
                    <p className="text-sm font-semibold text-foreground">Next step</p>
                    <p className="mt-1 text-xs leading-relaxed text-secondary">
                        Keisha Grant is working on it: 2 of 3 items done.
                    </p>
                    <p className="mt-3 rounded-md bg-accent py-1.5 text-center text-xs font-medium text-on-accent">
                        Mark as completed
                    </p>
                </div>
            </div>
        </div>
    );
}

function UpdatesPicture() {
    const updates = [
        { title: "Repaint between leases", text: "Keisha Grant checked off “Paint walls, two coats”.", time: "2m", status: "IN_PROGRESS", unread: true },
        { title: "Leak under kitchen sink", text: "Marcus Hill finished the job and left a note.", time: "1h", status: "COMPLETED", unread: true },
        { title: "Roach treatment", text: "Past its due date with nothing checked off.", time: "Today", overdue: true },
    ];
    return (
        <div className={`${card} divide-y divide-line`}>
            <p className="px-4 py-2.5 text-sm font-semibold text-foreground">Notifications</p>
            {updates.map((update) => (
                <div key={update.title} className={`px-4 py-3 ${update.unread ? "bg-accent/[0.04]" : ""}`}>
                    <div className="flex items-baseline gap-2">
                        <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                            {update.unread && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-accent" />}
                            {update.title}
                        </p>
                        <span className="text-xs text-muted">{update.time}</span>
                    </div>
                    <p className="mt-0.5 text-sm text-muted">{update.text}</p>
                    <div className="mt-1.5">
                        {update.overdue ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-danger">
                                <AlertIcon size={12} />
                                Overdue
                            </span>
                        ) : (
                            update.status && <StatusBadge status={update.status} />
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}

function FoxBotPicture() {
    const areas = [
        { name: "Kitchen", items: ["Fix the leak under the sink cabinet", "Clear the jammed disposal"] },
        { name: "Bathroom", items: ["Recaulk the tub"] },
    ];
    return (
        <div>
            <div className={`${card} p-3`}>
                <p className="text-xs font-medium text-muted">Describe the job</p>
                <p className="mt-1.5 text-sm leading-relaxed text-foreground">
                    812 Augusta St, unit B, for Hill Plumbing by Friday. Kitchen: the sink is leaking under the cabinet
                    and the disposal is jammed. Bathroom: recaulk the tub.
                </p>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted">
                #2026-1030 <StatusBadge status="DRAFT" />
                <span>Due Nov 20</span>
            </div>
            <p className="mt-2 text-lg font-semibold text-foreground">Kitchen sink leak and bathroom caulking</p>
            <p className="text-xs font-medium text-secondary">812 Augusta St, Unit B · Hill Plumbing</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]">
                <div className="flex flex-col gap-3">
                    {areas.map((area) => (
                        <div key={area.name} className="rounded-xl border border-line bg-surface">
                            <p className="border-b border-line px-3 py-2 text-xs font-semibold text-foreground">
                                {area.name}
                            </p>
                            <ul className="divide-y divide-line">
                                {area.items.map((item) => (
                                    <li key={item} className="flex items-start gap-2.5 px-3 py-2.5">
                                        <span className="mt-px flex h-4 w-4 shrink-0 rounded border-2 border-line-strong" />
                                        <span className="text-xs leading-snug text-foreground">{item}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
                <div className={`${card} h-fit p-3`}>
                    <p className="text-sm font-semibold text-foreground">Next step</p>
                    <p className="mt-1 text-xs leading-relaxed text-secondary">Ready to send to Hill Plumbing.</p>
                    <p className="mt-3 rounded-md bg-accent py-1.5 text-center text-xs font-medium text-on-accent">
                        Send by email
                    </p>
                </div>
            </div>
        </div>
    );
}
