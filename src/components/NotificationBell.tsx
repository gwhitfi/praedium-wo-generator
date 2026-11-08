"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { openNotifications } from "@/app/(app)/inbox/actions";
import { NOTIFICATIONS_SEEN_EVENT, type NotificationItem } from "@/lib/notificationTypes";
import NotificationRow from "./NotificationRow";

// The bell in the signed-in header. `unreadCount` comes from the server on each page load. Opening the dropdown
// loads the newest notifications and marks them seen. Closes on picking a link, clicking outside, or Escape.
export default function NotificationBell({ unreadCount }: { unreadCount: number }): React.ReactElement {
    const [open, setOpen] = useState(false);
    const [unread, setUnread] = useState(unreadCount);
    const [items, setItems] = useState<NotificationItem[] | null>(null);
    const [error, setError] = useState(false);
    const [loading, startLoading] = useTransition();
    const rootRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const panelId = useId();

    // A new count from the server (after navigating) replaces the local one.
    const [lastCount, setLastCount] = useState(unreadCount);
    if (unreadCount !== lastCount) {
        setLastCount(unreadCount);
        setUnread(unreadCount);
    }

    // The /inbox page marks everything seen when it opens.
    useEffect(() => {
        const clear = () => setUnread(0);
        window.addEventListener(NOTIFICATIONS_SEEN_EVENT, clear);
        return () => window.removeEventListener(NOTIFICATIONS_SEEN_EVENT, clear);
    }, []);

    useEffect(() => {
        if (!open) return;
        function onPointerDown(event: PointerEvent) {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
        }
        function onKeyDown(event: KeyboardEvent) {
            if (event.key !== "Escape") return;
            setOpen(false);
            buttonRef.current?.focus();
        }
        document.addEventListener("pointerdown", onPointerDown);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("pointerdown", onPointerDown);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [open]);

    function toggle() {
        if (open) {
            setOpen(false);
            return;
        }
        setOpen(true);
        setError(false);
        startLoading(async () => {
            try {
                setItems(await openNotifications());
                setUnread(0);
            } catch {
                setError(true);
            }
        });
    }

    const label = unread > 0 ? `Notifications, ${unread} unread` : "Notifications";
    const close = () => setOpen(false);

    return (
        <div ref={rootRef} className="relative">
            <button
                ref={buttonRef}
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                aria-label={label}
                title="Notifications"
                onClick={toggle}
                className="relative flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground hover:cursor-pointer"
            >
                <BellIcon />
                {unread > 0 && (
                    <span
                        aria-hidden
                        className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-none text-on-accent"
                    >
                        {unread > 9 ? "9+" : unread}
                    </span>
                )}
            </button>

            {open && (
                <div className="fixed inset-x-4 top-16 z-30 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:pt-2">
                    <div
                        id={panelId}
                        className="overflow-hidden rounded-lg border border-line bg-surface shadow-lg sm:w-96"
                    >
                        <p className="border-b border-line px-4 py-2.5 text-sm font-medium text-foreground">
                            Notifications
                        </p>
                        <Body items={items} loading={loading} error={error} onPick={close} />
                        <div className="flex items-center justify-between border-t border-line px-4 py-2 text-xs">
                            <Link
                                href="/settings#notifications"
                                onClick={close}
                                className="text-subtle hover:text-foreground"
                            >
                                Notification settings
                            </Link>
                            <Link
                                href="/inbox"
                                onClick={close}
                                className="font-medium text-accent hover:text-accent-hover"
                            >
                                See all
                            </Link>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function Body({
    items,
    loading,
    error,
    onPick,
}: {
    items: NotificationItem[] | null;
    loading: boolean;
    error: boolean;
    onPick: () => void;
}) {
    if (error) return <p className="px-4 py-6 text-center text-sm text-danger">Couldn&apos;t load notifications.</p>;
    if (!items) return <p className="px-4 py-6 text-center text-sm text-subtle">Loading…</p>;
    if (items.length === 0) {
        return <p className="px-4 py-6 text-center text-sm text-subtle">No notifications yet.</p>;
    }

    const now = new Date();
    return (
        <ul className={`divide-y divide-line ${loading ? "opacity-60" : ""}`}>
            {items.map((item) => (
                <NotificationRow key={item.id} item={item} now={now} onPick={onPick} />
            ))}
        </ul>
    );
}

function BellIcon() {
    return (
        <svg
            width={18}
            height={18}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
        >
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
    );
}
