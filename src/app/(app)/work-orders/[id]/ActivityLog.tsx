import { describeEvent, formatEventTime, type ActivityEvent } from "@/lib/activity";
import { cardClass, sectionTitleClass } from "@/lib/ui";

// Shown before "Show older events".
const RECENT_COUNT = 5;

// The work order's history, newest first. `limit` is how many events the page loaded; if it got that many,
// there may be older ones that aren't shown.
export default function ActivityLog({ events, limit }: { events: ActivityEvent[]; limit: number }) {
    if (events.length === 0) {
        return (
            <section aria-labelledby="activity-title" className="mt-10">
                <h2 id="activity-title" className={`${sectionTitleClass} mb-3`}>
                    Activity
                </h2>
                <p className="rounded-xl border border-dashed border-line-strong/60 px-4 py-4 text-sm text-muted">
                    No activity recorded yet. Changes, emails and the contractor&apos;s progress will show up here.
                </p>
            </section>
        );
    }

    const recent = events.slice(0, RECENT_COUNT);
    const older = events.slice(RECENT_COUNT);

    return (
        <section aria-labelledby="activity-title" className="mt-10">
            <h2 id="activity-title" className={`${sectionTitleClass} mb-3`}>
                Activity
            </h2>
            <EventList events={recent} />
            {older.length > 0 && (
                <details className="group mt-2">
                    <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded px-1 py-1 text-sm font-medium text-muted hover:text-foreground [&::-webkit-details-marker]:hidden">
                        <span className="group-open:hidden">
                            Show {older.length} older {older.length === 1 ? "event" : "events"}
                        </span>
                        <span className="hidden group-open:inline">Hide older events</span>
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
        <ol className={`${cardClass} divide-y divide-line text-sm`}>
            {events.map((event) => {
                const line = describeEvent(event);
                return (
                    <li key={event.id} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:gap-4 sm:px-5">
                        <time
                            dateTime={event.createdAt.toISOString()}
                            className="shrink-0 text-[0.8125rem] text-muted sm:w-40 sm:pt-px"
                        >
                            {formatEventTime(event.createdAt)}
                        </time>
                        <div className="min-w-0 [overflow-wrap:anywhere]">
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
        </ol>
    );
}
