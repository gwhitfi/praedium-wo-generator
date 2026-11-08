import Link from "next/link";
import { timeAgo, type NotificationItem, type NotificationTag } from "@/lib/notificationTypes";

const TAG_CLASSES: Record<NotificationTag["tone"], string> = {
    completed: "border-status-completed/50 text-status-completed",
    "in-progress": "border-status-in-progress/50 text-status-in-progress",
    sent: "border-status-sent/50 text-status-sent",
    cancelled: "border-status-cancelled/50 text-status-cancelled",
    closed: "border-status-closed/50 text-status-closed",
    danger: "border-danger/40 bg-danger/10 text-danger",
    neutral: "border-line-strong text-muted",
};

// One notification, linking to its work order. Used by the bell's dropdown and the /inbox page; `now` is passed in
// so a list shares one clock.
export default function NotificationRow({
    item,
    now,
    onPick,
}: {
    item: NotificationItem;
    now: Date;
    onPick?: () => void;
}): React.ReactElement {
    return (
        <li>
            <Link
                href={`/work-orders/${item.workOrderId}`}
                onClick={onPick}
                className="flex gap-3 px-4 py-3 hover:bg-surface-hover"
            >
                <span
                    aria-hidden
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.unread ? "bg-accent" : ""}`}
                />
                <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-xs text-subtle">
                        <span className={`rounded-full border px-1.5 py-px font-medium ${TAG_CLASSES[item.tag.tone]}`}>
                            {item.tag.label}
                        </span>
                        <span className="truncate">
                            {item.jobNumber} · {item.title}
                        </span>
                        {/* Older rows show a date, which the server and browser may format in different time zones. */}
                        <time
                            dateTime={item.at}
                            title={item.fullTime}
                            className="ml-auto shrink-0"
                            suppressHydrationWarning
                        >
                            {timeAgo(new Date(item.at), now)}
                        </time>
                    </span>
                    <span className="mt-1 block text-sm text-foreground">
                        {item.unread && <span className="sr-only">Unread: </span>}
                        {item.text}
                    </span>
                </span>
            </Link>
        </li>
    );
}
