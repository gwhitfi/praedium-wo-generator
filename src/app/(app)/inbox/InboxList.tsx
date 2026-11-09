"use client";

import { useState, useTransition } from "react";
import NotificationRow from "@/components/NotificationRow";
import type { NotificationItem } from "@/lib/notificationTypes";
import { loadMoreNotifications } from "./actions";
import EmptyState from "@/components/list/EmptyState";
import { Button } from "@/components/Button";
import { BellIcon } from "@/components/Icons";
import { cardClass } from "@/lib/ui";

// The inbox's list: the first notifications come from the server, "Show more" adds the next ones in place.
// `now` is the server's clock, so the "3h ago" times match between the server render and the browser.
export default function InboxList({
    initialItems,
    initialHasMore,
    unreadAfter,
    now,
}: {
    initialItems: NotificationItem[];
    initialHasMore: boolean;
    unreadAfter: string;
    now: string;
}): React.ReactElement {
    const [items, setItems] = useState(initialItems);
    const [hasMore, setHasMore] = useState(initialHasMore);
    const [error, setError] = useState(false);
    const [loading, startLoading] = useTransition();
    const clock = new Date(now);

    function showMore() {
        setError(false);
        startLoading(async () => {
            try {
                const page = await loadMoreNotifications(items.length, unreadAfter);
                // Skip rows already shown, in case new notifications arrived and shifted the list.
                setItems((current) => {
                    const shown = new Set(current.map((item) => item.id));
                    return [...current, ...page.items.filter((item) => !shown.has(item.id))];
                });
                setHasMore(page.hasMore);
            } catch {
                setError(true);
            }
        });
    }

    if (items.length === 0) {
        return (
            <EmptyState
                icon={<BellIcon size={22} />}
                title="You're all caught up"
                message="When a contractor opens a work order, checks off work or finishes it, you'll see it here."
            />
        );
    }

    return (
        <>
            <ul className={`${cardClass} divide-y divide-line overflow-hidden`}>
                {items.map((item) => (
                    <NotificationRow key={item.id} item={item} now={clock} />
                ))}
            </ul>
            {(hasMore || error) && (
                <div className="mt-4 flex flex-col items-center gap-2">
                    {error && (
                        <p role="alert" className="text-sm text-danger">
                            Couldn&apos;t load more. Try again.
                        </p>
                    )}
                    <Button onClick={showMore} pending={loading} pendingLabel="Loading…">
                        Show more
                    </Button>
                </div>
            )}
        </>
    );
}
