"use server";

import { getCurrentUser } from "@/lib/auth";
import { latestNotifications, markNotificationsSeen, notificationViewer, notificationsPage } from "@/lib/notifications";
import type { NotificationItem } from "@/lib/notificationTypes";
import { INBOX_MAX_ITEMS, INBOX_PAGE_SIZE, loadMoreInput } from "./schemas";

// How many notifications the Nav's dropdown shows.
const DROPDOWN_LIMIT = 5;

// Opening the Nav's notifications dropdown: returns the newest few (with what was unread until now) and marks
// everything seen for this user in the active organization.
export async function openNotifications(): Promise<NotificationItem[]> {
    const result = await getCurrentUser();
    if (result.state !== "ready") throw new Error("Not authorized");

    const viewer = await notificationViewer(result.user, result.organization.id);
    const items = await latestNotifications(viewer, DROPDOWN_LIMIT);
    await markNotificationsSeen(viewer);
    return items;
}

// Called by the /inbox page after it renders, so the page can still show what was unread.
export async function markInboxSeen(): Promise<void> {
    const result = await getCurrentUser();
    if (result.state !== "ready") throw new Error("Not authorized");

    await markNotificationsSeen(await notificationViewer(result.user, result.organization.id));
}

// The inbox's "Show more": the next INBOX_PAGE_SIZE notifications after `offset`. `unreadAfter` only decides
// which rows get an unread dot.
export async function loadMoreNotifications(
    offset: number,
    unreadAfter: string,
): Promise<{ items: NotificationItem[]; hasMore: boolean }> {
    const result = await getCurrentUser();
    if (result.state !== "ready") throw new Error("Not authorized");

    const input = loadMoreInput.parse({ offset, unreadAfter });
    const limit = Math.min(INBOX_PAGE_SIZE, INBOX_MAX_ITEMS - input.offset);
    if (limit <= 0) return { items: [], hasMore: false };

    const viewer = await notificationViewer(result.user, result.organization.id);
    const page = await notificationsPage(viewer, { offset: input.offset, limit, since: input.unreadAfter });
    return { items: page.items, hasMore: page.hasMore && input.offset + limit < INBOX_MAX_ITEMS };
}
