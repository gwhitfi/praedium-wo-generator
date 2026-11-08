// Server-only. Notifications are not stored: they're the activity log (WorkOrderEvent) filtered by the options the
// user turned on, leaving out what the user did themselves, plus open work orders past their due date.
// Membership.notificationsSeenAt (per user and organization) decides which ones are unread.
import type { Prisma, User, WorkOrderEventType } from "@/generated/prisma/client";
import prisma from "./prisma";
import { describeEvent } from "./activity";
import { dateInAppTimeZone, formatDueDate, formatFullDate, formatFullTimestamp } from "./dates";
import { WORK_ORDER_FILTERS } from "./workOrders";
import {
    resolveNotificationTypes,
    type NotificationItem,
    type NotificationTag,
    type NotificationType,
} from "./notificationTypes";

// How far back unread notifications go for someone who has never opened the dropdown.
const FIRST_LOOK_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

const STATUS_EVENTS: WorkOrderEventType[] = [
    "SENT",
    "STARTED",
    "COMPLETED_BY_OFFICE",
    "COMPLETED_BY_CONTRACTOR",
    "CANCELLED",
    "REOPENED",
    "CLOSED",
    "ARCHIVED",
    "RESTORED",
];

// A check-off that moved the work order from Sent to In progress (set by the contractor page).
const STARTED_CHECK: Prisma.WorkOrderEventWhereInput = {
    type: "ITEM_CHECKED",
    detail: { path: ["started"], equals: true },
};

// The events each option covers. Overdue isn't an event; see overdueWhere().
const EVENT_CONDITIONS: Record<Exclude<NotificationType, "overdue">, Prisma.WorkOrderEventWhereInput> = {
    completed: { type: { in: ["COMPLETED_BY_OFFICE", "COMPLETED_BY_CONTRACTOR"] } },
    contractor_started: { ...STARTED_CHECK, byContractor: true },
    contractor_opened: { type: "OPENED" },
    status_changes: { OR: [{ type: { in: STATUS_EVENTS } }, STARTED_CHECK] },
    created: { type: "CREATED" },
    item_checked: { type: "ITEM_CHECKED" },
    area_completed: { type: "ITEM_CHECKED", detail: { path: ["areaCompleted"], equals: true } },
    contractor_note: { type: "NOTE_SAVED", byContractor: true, detail: { path: ["note"], not: "" } },
};

export type NotificationViewer = {
    userId: string;
    organizationId: string;
    types: NotificationType[];
    seenAt: Date | null;
};

export async function notificationViewer(
    user: Pick<User, "id" | "notificationTypes">,
    organizationId: string,
): Promise<NotificationViewer> {
    const membership = await prisma.membership.findUnique({
        where: { userId_organizationId: { userId: user.id, organizationId } },
        select: { notificationsSeenAt: true },
    });
    return {
        userId: user.id,
        organizationId,
        types: resolveNotificationTypes(user.notificationTypes),
        seenAt: membership?.notificationsSeenAt ?? null,
    };
}

// Notifications after this are unread.
export function unreadSince(viewer: Pick<NotificationViewer, "seenAt">, now: Date = new Date()): Date {
    return viewer.seenAt ?? new Date(now.getTime() - FIRST_LOOK_DAYS * DAY_MS);
}

// Null when none of the user's options are events.
export function eventsWhere(viewer: NotificationViewer): Prisma.WorkOrderEventWhereInput | null {
    const conditions = viewer.types.flatMap((type) => (type === "overdue" ? [] : [EVENT_CONDITIONS[type]]));
    if (conditions.length === 0) return null;
    return {
        organizationId: viewer.organizationId,
        AND: [
            // Written out with `null`: Prisma's `not` alone would also drop contractor events, which have no user.
            { OR: [{ actorUserId: null }, { actorUserId: { not: viewer.userId } }] },
            { OR: conditions },
        ],
    };
}

// Null when the user turned overdue notifications off. Same rule as the Overdue filter, minus archived ones.
export function overdueWhere(viewer: NotificationViewer): Prisma.WorkOrderWhereInput | null {
    if (!viewer.types.includes("overdue")) return null;
    return { organizationId: viewer.organizationId, archived: false, ...WORK_ORDER_FILTERS.overdue.where() };
}

// A work order becomes overdue at the start of the day after its due date. Its notification is newer than `since`
// exactly when the due date is on or after the day `since` falls on.
function overdueAfter(since: Date): Date {
    return dateInAppTimeZone(since);
}

export async function countUnread(viewer: NotificationViewer): Promise<number> {
    const since = unreadSince(viewer);
    const events = eventsWhere(viewer);
    const overdue = overdueWhere(viewer);
    const [eventCount, overdueCount] = await Promise.all([
        events ? prisma.workOrderEvent.count({ where: { ...events, createdAt: { gt: since } } }) : 0,
        overdue
            ? prisma.workOrder.count({
                  where: { AND: [overdue, { dueDate: { gte: overdueAfter(since) } }] },
              })
            : 0,
    ]);
    return eventCount + overdueCount;
}

// For the Nav's bell on every signed-in page. Never throws: a failed count shows no badge instead of breaking the page.
export async function navUnreadCount(
    user: Pick<User, "id" | "notificationTypes">,
    organizationId: string,
): Promise<number> {
    try {
        return await countUnread(await notificationViewer(user, organizationId));
    } catch (error) {
        console.error("navUnreadCount failed", error);
        return 0;
    }
}

type EventRow = {
    id: string;
    type: WorkOrderEventType;
    createdAt: Date;
    actorName: string | null;
    byContractor: boolean;
    detail: Prisma.JsonValue;
    workOrder: { id: string; jobNumber: string; title: string };
};

function detailFlag(detail: Prisma.JsonValue, key: string): boolean {
    return typeof detail === "object" && detail !== null && !Array.isArray(detail) && detail[key] === true;
}

const STATUS_TAGS: Partial<Record<WorkOrderEventType, NotificationTag>> = {
    SENT: { label: "Sent", tone: "sent" },
    STARTED: { label: "Started", tone: "in-progress" },
    COMPLETED_BY_OFFICE: { label: "Completed", tone: "completed" },
    COMPLETED_BY_CONTRACTOR: { label: "Completed", tone: "completed" },
    CANCELLED: { label: "Cancelled", tone: "cancelled" },
    REOPENED: { label: "Reopened", tone: "sent" },
    CLOSED: { label: "Closed", tone: "closed" },
    ARCHIVED: { label: "Archived", tone: "neutral" },
    RESTORED: { label: "Restored", tone: "neutral" },
};

// The tag for an event, picked by what the user asked to hear about when one event fits several options.
export function eventTag(event: Pick<EventRow, "type" | "detail">, types: NotificationType[]): NotificationTag {
    const status = STATUS_TAGS[event.type];
    if (status) return status;
    switch (event.type) {
        case "OPENED":
            return { label: "Opened", tone: "sent" };
        case "CREATED":
            return { label: "Created", tone: "neutral" };
        case "NOTE_SAVED":
            return { label: "Note", tone: "neutral" };
        case "ITEM_CHECKED": {
            const started = detailFlag(event.detail, "started");
            const areaDone = detailFlag(event.detail, "areaCompleted");
            const wantsStarted = types.includes("contractor_started") || types.includes("status_changes");
            if (started && (wantsStarted || !areaDone)) return { label: "Started", tone: "in-progress" };
            if (areaDone) return { label: "Area finished", tone: "completed" };
            return { label: "Checked off", tone: "neutral" };
        }
        default:
            return { label: "Update", tone: "neutral" };
    }
}

// The newest `limit` notifications, newest first.
export async function latestNotifications(viewer: NotificationViewer, limit: number): Promise<NotificationItem[]> {
    return (await notificationsPage(viewer, { offset: 0, limit })).items;
}

// One page of notifications, newest first. Events and overdue work orders are two sources merged by time, so each
// is read up to the end of the page; fine for the depths people page to. `hasMore` is true when anything follows.
// `since` overrides the unread cut-off (the inbox keeps the one it opened with).
export async function notificationsPage(
    viewer: NotificationViewer,
    { offset, limit, since: sinceOverride }: { offset: number; limit: number; since?: Date },
): Promise<{ items: NotificationItem[]; hasMore: boolean }> {
    const since = sinceOverride ?? unreadSince(viewer);
    const events = eventsWhere(viewer);
    const overdue = overdueWhere(viewer);
    const take = offset + limit + 1;
    const [eventRows, overdueRows] = await Promise.all([
        events
            ? prisma.workOrderEvent.findMany({
                  where: events,
                  orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                  take,
                  select: {
                      id: true,
                      type: true,
                      createdAt: true,
                      actorName: true,
                      byContractor: true,
                      detail: true,
                      workOrder: { select: { id: true, jobNumber: true, title: true } },
                  },
              })
            : [],
        overdue
            ? prisma.workOrder.findMany({
                  where: overdue,
                  orderBy: [{ dueDate: "desc" }, { id: "desc" }],
                  take,
                  select: { id: true, jobNumber: true, title: true, dueDate: true },
              })
            : [],
    ]);

    const fromEvents = eventRows.map((event) => ({
        sortAt: event.createdAt,
        item: {
            id: event.id,
            workOrderId: event.workOrder.id,
            jobNumber: event.workOrder.jobNumber,
            title: event.workOrder.title,
            tag: eventTag(event, viewer.types),
            text: describeEvent(event).text,
            at: event.createdAt.toISOString(),
            fullTime: formatFullTimestamp(event.createdAt),
            unread: event.createdAt > since,
        },
    }));
    const after = overdueAfter(since);
    const fromOverdue = overdueRows.flatMap((workOrder) => {
        if (!workOrder.dueDate) return [];
        // Close enough for ordering: midnight UTC after the due date, not midnight in APP_TIMEZONE.
        const at = new Date(workOrder.dueDate.getTime() + DAY_MS);
        return [
            {
                sortAt: at,
                item: {
                    id: `overdue-${workOrder.id}`,
                    workOrderId: workOrder.id,
                    jobNumber: workOrder.jobNumber,
                    title: workOrder.title,
                    tag: { label: "Overdue", tone: "danger" } as const,
                    text: `Was due ${formatDueDate(workOrder.dueDate)}`,
                    at: at.toISOString(),
                    // The day it became overdue.
                    fullTime: formatFullDate(at),
                    unread: workOrder.dueDate >= after,
                },
            },
        ];
    });

    const merged = [...fromEvents, ...fromOverdue].sort((a, b) => b.sortAt.getTime() - a.sortAt.getTime());
    return {
        items: merged.slice(offset, offset + limit).map((entry) => entry.item),
        hasMore: merged.length > offset + limit,
    };
}

export async function markNotificationsSeen(viewer: NotificationViewer, now: Date = new Date()): Promise<void> {
    await prisma.membership.updateMany({
        where: { userId: viewer.userId, organizationId: viewer.organizationId },
        data: { notificationsSeenAt: now },
    });
}
