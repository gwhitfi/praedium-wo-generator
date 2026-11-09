"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { openNotifications } from "@/app/(app)/inbox/actions";
import { NOTIFICATIONS_SEEN_EVENT, type NotificationItem } from "@/lib/notificationTypes";
import NotificationRow from "./NotificationRow";
import { BellIcon } from "./Icons";
import { iconButtonClass } from "@/lib/ui";
import { usePathname } from "next/navigation";
import { ACTIVE_ICON_CLASS } from "./NavLinks";

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

    const onInbox = usePathname() === "/inbox";
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
                className={`relative ${iconButtonClass()} ${onInbox ? ACTIVE_ICON_CLASS : ""}`}
            >
                <BellIcon size={18} />
                {unread > 0 && (
                    <span
                        aria-hidden
                        className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-none text-on-accent ring-2 ring-background"
                    >
                        {unread > 9 ? "9+" : unread}
                    </span>
                )}
            </button>

            {open && (
                <div className="fixed inset-x-3 top-[4.25rem] z-30 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:pt-2">
                    <div
                        id={panelId}
                        className="flex max-h-[calc(100dvh-5.5rem)] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-xl sm:w-[26rem]"
                    >
                        <p className="border-b border-line px-4 py-3 text-sm font-semibold text-foreground">
                            Notifications
                        </p>
                        <div className="min-h-0 overflow-y-auto">
                            <Body items={items} loading={loading} error={error} onPick={close} />
                        </div>
                        <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-sm">
                            <Link
                                href="/settings#notifications"
                                onClick={close}
                                className="text-muted hover:text-foreground"
                            >
                                Settings
                            </Link>
                            <Link
                                href="/inbox"
                                onClick={close}
                                className="font-medium text-accent hover:text-accent-hover"
                            >
                                Open inbox
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
    if (error) {
        return (
            <p role="alert" className="px-4 py-8 text-center text-sm text-danger">
                Couldn&apos;t load notifications. Close and try again.
            </p>
        );
    }
    if (!items) {
        return (
            <p role="status" className="px-4 py-8 text-center text-sm text-subtle">
                Loading…
            </p>
        );
    }
    if (items.length === 0) {
        return (
            <p className="px-4 py-8 text-center text-sm text-muted">
                You&apos;re all caught up. Updates from contractors and your team show up here.
            </p>
        );
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

