import Link from "next/link";
import { timeAgo, type NotificationItem, type NotificationTag } from "@/lib/notificationTypes";
import type { STATUS_COLORS } from "@/lib/defaults";
import { badgeClass, smallTextClass } from "@/lib/ui";
import { AlertIcon } from "./Icons";
import { StatusBadge } from "./StatusBadge";

// Tags that name a status look like that status's pill.
const TAG_STATUS: Partial<Record<NotificationTag["tone"], keyof typeof STATUS_COLORS>> = {
    completed: "COMPLETED",
    "in-progress": "IN_PROGRESS",
    sent: "SENT",
    cancelled: "CANCELLED",
    closed: "CLOSED",
};

// One notification, linking to its work order. Used by the bell's dropdown and the /inbox page; `now` is passed in
// so a list shares one clock. The work order's title leads, then what happened, then the tag and job number.
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
                className={`block px-4 py-3.5 hover:bg-surface-hover ${item.unread ? "bg-accent/[0.04]" : ""}`}
            >
                <span className="flex items-baseline gap-3">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                        {/* Unread rows get a dot before the title; read ones start flush, with no empty gutter. */}
                        {item.unread && (
                            <>
                                <span aria-hidden className="mr-2 inline-block h-2 w-2 rounded-full bg-accent" />
                                <span className="sr-only">Unread: </span>
                            </>
                        )}
                        {item.title}
                    </span>
                    {/* Older rows show a date, which the server and browser may format in different time zones. */}
                    <time
                        dateTime={item.at}
                        title={item.fullTime}
                        className={`shrink-0 text-muted ${smallTextClass}`}
                        suppressHydrationWarning
                    >
                        {timeAgo(new Date(item.at), now)}
                    </time>
                </span>
                <span className="mt-0.5 block text-sm text-muted">{item.text}</span>
                <span className={`mt-1.5 flex items-center gap-2 text-subtle ${smallTextClass}`}>
                    <Tag tag={item.tag} />
                    <span className="tabular-nums">#{item.jobNumber}</span>
                </span>
            </Link>
        </li>
    );
}

// A status tag is a status pill. "Overdue" isn't a status, so it's red text with a warning icon instead of a pill.
function Tag({ tag }: { tag: NotificationTag }): React.ReactElement {
    if (tag.tone === "danger") {
        return (
            <span className="inline-flex items-center gap-1 font-medium text-danger">
                <AlertIcon size={13} />
                {tag.label}
            </span>
        );
    }
    const status = TAG_STATUS[tag.tone];
    if (status) return <StatusBadge status={status} label={tag.label} />;
    return (
        <span className={`${badgeClass} border-line-strong text-secondary`}>
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-subtle" />
            {tag.label}
        </span>
    );
}
