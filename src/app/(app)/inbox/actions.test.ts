import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/notifications", () => ({
    notificationViewer: vi.fn(),
    latestNotifications: vi.fn(),
    markNotificationsSeen: vi.fn(),
    notificationsPage: vi.fn(),
}));

import { getCurrentUser } from "@/lib/auth";
import { latestNotifications, markNotificationsSeen, notificationViewer, notificationsPage } from "@/lib/notifications";
import { loadMoreNotifications, markInboxSeen, openNotifications } from "./actions";

const user = { id: "user1", notificationTypes: [] };
const viewer = { userId: "user1", organizationId: "org1", types: [], seenAt: null };

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({
        state: "ready",
        user,
        organization: { id: "org1" },
        role: "USER",
    } as never);
    vi.mocked(notificationViewer).mockResolvedValue(viewer);
    vi.mocked(latestNotifications).mockResolvedValue([]);
});

describe("openNotifications", () => {
    it("reads the newest 5 for the signed-in user's organization, then marks them seen", async () => {
        await openNotifications();

        expect(notificationViewer).toHaveBeenCalledWith(user, "org1");
        expect(latestNotifications).toHaveBeenCalledWith(viewer, 5);
        expect(markNotificationsSeen).toHaveBeenCalledWith(viewer);
        expect(vi.mocked(latestNotifications).mock.invocationCallOrder[0]).toBeLessThan(
            vi.mocked(markNotificationsSeen).mock.invocationCallOrder[0],
        );
    });
});

describe("markInboxSeen", () => {
    it("marks the signed-in user's notifications seen", async () => {
        await markInboxSeen();
        expect(markNotificationsSeen).toHaveBeenCalledWith(viewer);
    });
});

describe("loadMoreNotifications", () => {
    const unreadAfter = "2026-11-05T15:00:00.000Z";

    beforeEach(() => {
        vi.mocked(notificationsPage).mockResolvedValue({ items: [], hasMore: true });
    });

    it("reads the next 15 with the page's unread cut-off, without marking anything seen", async () => {
        expect(await loadMoreNotifications(15, unreadAfter)).toEqual({ items: [], hasMore: true });
        expect(notificationsPage).toHaveBeenCalledWith(viewer, {
            offset: 15,
            limit: 15,
            since: new Date(unreadAfter),
        });
        expect(markNotificationsSeen).not.toHaveBeenCalled();
    });

    it("stops at the cap", async () => {
        expect(await loadMoreNotifications(990, unreadAfter)).toEqual({ items: [], hasMore: false });
        expect(notificationsPage).toHaveBeenCalledWith(viewer, expect.objectContaining({ offset: 990, limit: 10 }));

        vi.mocked(notificationsPage).mockClear();
        expect(await loadMoreNotifications(1000, unreadAfter)).toEqual({ items: [], hasMore: false });
        expect(notificationsPage).not.toHaveBeenCalled();
    });

    it("rejects bad input", async () => {
        await expect(loadMoreNotifications(-5, unreadAfter)).rejects.toThrow();
        await expect(loadMoreNotifications(15, "soon")).rejects.toThrow();
        expect(notificationsPage).not.toHaveBeenCalled();
    });
});

describe.each([
    ["openNotifications", openNotifications],
    ["markInboxSeen", markInboxSeen],
    ["loadMoreNotifications", () => loadMoreNotifications(15, "2026-11-05T15:00:00.000Z")],
])("%s", (_name, action) => {
    it("requires a signed-in user with an organization", async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({ state: "needs-org", clerkUserId: "clerk1" });

        await expect(action()).rejects.toThrow("Not authorized");
        expect(markNotificationsSeen).not.toHaveBeenCalled();
    });
});
