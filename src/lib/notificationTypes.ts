// The notification options a user can turn on in Settings, and the shape of one notification as the Nav's
// dropdown shows it. Shared with client components: no database access here (see notifications.ts).

export const NOTIFICATION_TYPES = [
    {
        key: "completed",
        label: "Work order completed",
        description: "A contractor or a teammate marks a work order complete.",
        default: true,
    },
    {
        key: "contractor_started",
        label: "Contractor started work",
        description: "The contractor checks off their first line item, which moves it to In progress.",
        default: true,
    },
    {
        key: "contractor_opened",
        label: "Contractor opened the work order",
        description: "The contractor opens their link (at most once a day per work order).",
        default: true,
    },
    {
        key: "overdue",
        label: "Work order overdue",
        description: "An open work order passes its due date.",
        default: true,
    },
    {
        key: "status_changes",
        label: "Any status change",
        description: "Sent, started, completed, cancelled, reopened, closed, archived or restored.",
        default: false,
    },
    { key: "created", label: "Work order created", description: "A teammate creates a work order.", default: false },
    {
        key: "item_checked",
        label: "Line item checked off",
        description: "Any line item is checked off.",
        default: false,
    },
    {
        key: "area_completed",
        label: "Area finished",
        description: "The contractor checks off the last open line item in an area.",
        default: false,
    },
    {
        key: "contractor_note",
        label: "Contractor note",
        description: "The contractor adds or changes a note on a line item.",
        default: false,
    },
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number]["key"];

export const NOTIFICATION_KEYS = NOTIFICATION_TYPES.map((type) => type.key) as [
    NotificationType,
    ...NotificationType[],
];
const KEYS = NOTIFICATION_KEYS;

export const DEFAULT_NOTIFICATION_TYPES: NotificationType[] = NOTIFICATION_TYPES.filter((type) => type.default).map(
    (type) => type.key,
);

// Saved in place of an empty list when the user turns everything off, since an empty list means the defaults.
export const NO_NOTIFICATIONS = "none";

// What User.notificationTypes holds, turned into the options in effect. Unknown keys (from an option that was
// later removed) are ignored.
export function resolveNotificationTypes(stored: string[]): NotificationType[] {
    if (stored.length === 0) return DEFAULT_NOTIFICATION_TYPES;
    return KEYS.filter((key) => stored.includes(key));
}

// The reverse: what to save for a choice from Settings.
export function storedNotificationTypes(selected: NotificationType[]): string[] {
    return selected.length === 0 ? [NO_NOTIFICATIONS] : KEYS.filter((key) => selected.includes(key));
}

// Dispatched on `window` by the /inbox page once it has marked everything seen, so the bell clears its badge.
export const NOTIFICATIONS_SEEN_EVENT = "praedium:notifications-seen";

// A small tag in front of each notification. `tone` picks its color.
export type NotificationTag = {
    label: string;
    tone: "completed" | "in-progress" | "sent" | "cancelled" | "closed" | "danger" | "neutral";
};

// One row in the dropdown, sent to the browser. `at` is an ISO string; `fullTime` is the hover text
// ("October 26, 2026 12:22PM", or just the date for overdue work orders, which have no time).
export type NotificationItem = {
    fullTime: string;
    id: string;
    workOrderId: string;
    jobNumber: string;
    title: string;
    tag: NotificationTag;
    text: string;
    at: string;
    unread: boolean;
};

// "just now", "5m ago", "3h ago", "2d ago", then the date ("Oct 23").
export function timeAgo(date: Date, now: Date = new Date()): string {
    const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
    });
}
