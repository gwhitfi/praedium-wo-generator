import { describeEvent, formatEventTime, type ActivityEvent } from "@/lib/activity";

// Shown before "Show older events".
const RECENT_COUNT = 5;

// The work order's history, newest first. `limit` is how many events the page loaded; if it got that many,
// there may be older ones that aren't shown.
export default function ActivityLog({ events, limit }: { events: ActivityEvent[]; limit: number }) {
    if (events.length === 0) return null;

    const recent = events.slice(0, RECENT_COUNT);
    const older = events.slice(RECENT_COUNT);

    return (
        <section className="mt-10">
            <p className="mb-2 text-xs uppercase tracking-wide text-subtle">Activity</p>
            <EventList events={recent} />
            {older.length > 0 && (
                <details className="mt-2">
                    <summary className="cursor-pointer text-sm text-muted hover:text-foreground">
                        Show {older.length} older {older.length === 1 ? "event" : "events"}
                    </summary>
                    <div className="mt-2">
                        <EventList events={older} />
                        {events.length >= limit && (
                            <p className="mt-2 text-xs text-subtle">Only the latest {limit} events are shown.</p>
                        )}
                    </div>
                </details>
            )}
        </section>
    );
}

function EventList({ events }: { events: ActivityEvent[] }) {
    return (
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface/40 text-sm">
            {events.map((event) => {
                const line = describeEvent(event);
                return (
                    <li key={event.id} className="flex flex-col gap-0.5 px-4 py-2.5 sm:flex-row sm:gap-4">
                        <time dateTime={event.createdAt.toISOString()} className="shrink-0 text-subtle sm:w-44">
                            {formatEventTime(event.createdAt)}
                        </time>
                        <div className="min-w-0 break-words">
                            <p className="text-foreground">
                                {line.text}
                                {line.backfilled && (
                                    <span className="ml-2 text-xs text-subtle">from older records</span>
                                )}
                            </p>
                            {line.note && (
                                <p className="mt-0.5 whitespace-pre-line text-muted">&ldquo;{line.note}&rdquo;</p>
                            )}
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}
