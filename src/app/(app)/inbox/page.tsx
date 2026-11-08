import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { notificationViewer, notificationsPage, unreadSince } from "@/lib/notifications";
import InboxList from "./InboxList";
import MarkSeen from "./MarkSeen";
import { INBOX_PAGE_SIZE } from "./schemas";

// Every notification, newest first: 15 at first, "Show more" adds 15 at a time. Opening it marks everything seen
// (after it renders, so the unread dots still show).
export default async function Inbox() {
    const result = await getCurrentUser();
    if (result.state === "signed-out") redirect("/sign-in");
    if (result.state === "needs-org") redirect("/setup");

    const viewer = await notificationViewer(result.user, result.organization.id);
    const since = unreadSince(viewer);
    const { items, hasMore } = await notificationsPage(viewer, { offset: 0, limit: INBOX_PAGE_SIZE, since });

    return (
        <main className="mx-auto max-w-3xl px-4 py-10 text-foreground">
            <MarkSeen />
            <div className="mb-6 flex items-baseline justify-between gap-4">
                <h1 className="text-2xl font-semibold">Inbox</h1>
                <Link href="/settings#notifications" className="text-xs text-subtle hover:text-foreground">
                    Change defaults
                </Link>
            </div>
            <InboxList
                initialItems={items}
                initialHasMore={hasMore}
                unreadAfter={since.toISOString()}
                now={new Date().toISOString()}
            />
        </main>
    );
}
