import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { notificationViewer, notificationsPage, unreadSince } from "@/lib/notifications";
import PageHeader from "@/components/list/PageHeader";
import { ButtonLink } from "@/components/Button";
import { SlidersIcon } from "@/components/Icons";
import { pageClass } from "@/lib/ui";
import InboxList from "./InboxList";
import MarkSeen from "./MarkSeen";
import { INBOX_PAGE_SIZE } from "./schemas";

export const metadata: Metadata = { title: "Inbox" };

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
        <main id="main" className={pageClass}>
            <MarkSeen />
            <div>
                <PageHeader
                    title="Inbox"
                    subtitle="Updates on your work orders from contractors and your team."
                    actions={
                        <ButtonLink href="/settings#notifications" size="sm" variant="ghost">
                            <SlidersIcon size={14} />
                            Choose what shows here
                        </ButtonLink>
                    }
                />
                <InboxList
                    initialItems={items}
                    initialHasMore={hasMore}
                    unreadAfter={since.toISOString()}
                    now={new Date().toISOString()}
                />
            </div>
        </main>
    );
}
