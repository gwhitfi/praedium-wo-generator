import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./prisma", () => ({
    default: {
        membership: { findUnique: vi.fn(), updateMany: vi.fn() },
        workOrderEvent: { count: vi.fn(), findMany: vi.fn() },
        workOrder: { count: vi.fn(), findMany: vi.fn() },
    },
}));

import prisma from "./prisma";
import {
    countUnread,
    eventTag,
    eventsWhere,
    latestNotifications,
    markNotificationsSeen,
    navUnreadCount,
    notificationViewer,
    notificationsPage,
    overdueWhere,
    unreadSince,
    type NotificationViewer,
} from "./notifications";

const viewer = (changes: Partial<NotificationViewer> = {}): NotificationViewer => ({
    userId: "user1",
    organizationId: "org1",
    types: ["completed", "contractor_started", "contractor_opened", "overdue"],
    seenAt: new Date("2026-11-05T15:00:00Z"),
    ...changes,
});

const workOrder = { id: "wo1", jobNumber: "2026-1001", title: "Leaky faucet" };

function event(changes: Record<string, unknown>) {
    return {
        id: "ev1",
        type: "COMPLETED_BY_CONTRACTOR",
        createdAt: new Date("2026-11-06T10:00:00Z"),
        actorName: "Marcus Hill",
        byContractor: true,
        detail: { notes: null },
        workOrder,
        ...changes,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("APP_TIMEZONE", "America/New_York");
    vi.mocked(prisma.workOrderEvent.findMany).mockResolvedValue([]);
    vi.mocked(prisma.workOrder.findMany).mockResolvedValue([]);
    vi.mocked(prisma.workOrderEvent.count).mockResolvedValue(0);
    vi.mocked(prisma.workOrder.count).mockResolvedValue(0);
});

describe("notificationViewer", () => {
    it("reads the seen time for this organization and the defaults when nothing is saved", async () => {
        const seenAt = new Date("2026-11-01T00:00:00Z");
        vi.mocked(prisma.membership.findUnique).mockResolvedValue({ notificationsSeenAt: seenAt } as never);

        const result = await notificationViewer({ id: "user1", notificationTypes: [] }, "org1");

        expect(prisma.membership.findUnique).toHaveBeenCalledWith({
            where: { userId_organizationId: { userId: "user1", organizationId: "org1" } },
            select: { notificationsSeenAt: true },
        });
        expect(result).toEqual(viewer({ seenAt }));
    });
});

describe("unreadSince", () => {
    it("is the seen time, or a week back for someone who never looked", () => {
        const now = new Date("2026-11-07T12:00:00Z");
        expect(unreadSince(viewer(), now)).toEqual(new Date("2026-11-05T15:00:00Z"));
        expect(unreadSince(viewer({ seenAt: null }), now)).toEqual(new Date("2026-10-31T12:00:00Z"));
    });
});

describe("eventsWhere", () => {
    it("scopes to the organization and leaves out the user's own actions but not contractor ones", () => {
        const where = eventsWhere(viewer());
        expect(where).toMatchObject({
            organizationId: "org1",
            AND: [{ OR: [{ actorUserId: null }, { actorUserId: { not: "user1" } }] }, expect.anything()],
        });
    });

    it("covers exactly the chosen options", () => {
        const where = eventsWhere(viewer({ types: ["contractor_opened", "area_completed"] }));
        expect(where?.AND).toContainEqual({
            OR: [{ type: "OPENED" }, { type: "ITEM_CHECKED", detail: { path: ["areaCompleted"], equals: true } }],
        });
    });

    it("is null when only overdue (or nothing) is chosen", () => {
        expect(eventsWhere(viewer({ types: ["overdue"] }))).toBeNull();
        expect(eventsWhere(viewer({ types: [] }))).toBeNull();
    });
});

describe("overdueWhere", () => {
    it("is open, unarchived work orders past due in the organization, or null when turned off", () => {
        expect(overdueWhere(viewer())).toMatchObject({
            organizationId: "org1",
            archived: false,
            status: { in: ["DRAFT", "SENT", "IN_PROGRESS"] },
            dueDate: { lt: expect.any(Date) },
        });
        expect(overdueWhere(viewer({ types: ["completed"] }))).toBeNull();
    });
});

describe("countUnread", () => {
    it("adds events after the seen time and work orders that became overdue since", async () => {
        vi.mocked(prisma.workOrderEvent.count).mockResolvedValue(3);
        vi.mocked(prisma.workOrder.count).mockResolvedValue(2);

        expect(await countUnread(viewer())).toBe(5);
        expect(prisma.workOrderEvent.count).toHaveBeenCalledWith({
            where: expect.objectContaining({ createdAt: { gt: new Date("2026-11-05T15:00:00Z") } }),
        });
        // Seen at 10 AM Nov 5 in New York: a work order due Nov 5 or later became overdue after that.
        expect(prisma.workOrder.count).toHaveBeenCalledWith({
            where: { AND: [expect.anything(), { dueDate: { gte: new Date("2026-11-05T00:00:00Z") } }] },
        });
    });

    it("skips the queries for options that are off", async () => {
        expect(await countUnread(viewer({ types: [] }))).toBe(0);
        expect(prisma.workOrderEvent.count).not.toHaveBeenCalled();
        expect(prisma.workOrder.count).not.toHaveBeenCalled();
    });
});

describe("navUnreadCount", () => {
    it("returns 0 instead of throwing", async () => {
        vi.mocked(prisma.membership.findUnique).mockRejectedValue(new Error("db down"));
        vi.spyOn(console, "error").mockImplementation(() => {});

        expect(await navUnreadCount({ id: "user1", notificationTypes: [] }, "org1")).toBe(0);
    });
});

describe("eventTag", () => {
    const all = ["contractor_started", "area_completed", "item_checked"] as const;

    it("names status events", () => {
        expect(eventTag({ type: "COMPLETED_BY_OFFICE", detail: null }, [...all])).toEqual({
            label: "Completed",
            tone: "completed",
        });
        expect(eventTag({ type: "OPENED", detail: null }, [...all]).label).toBe("Opened");
    });

    it("tells check-offs apart by what they did", () => {
        const check = (detail: Record<string, unknown>, types: Parameters<typeof eventTag>[1]) =>
            eventTag({ type: "ITEM_CHECKED", detail: { item: "a", area: "b", ...detail } }, types).label;

        expect(check({}, [...all])).toBe("Checked off");
        expect(check({ started: true }, [...all])).toBe("Started");
        expect(check({ areaCompleted: true }, [...all])).toBe("Area finished");
        expect(check({ started: true, areaCompleted: true }, [...all])).toBe("Started");
        expect(check({ started: true, areaCompleted: true }, ["area_completed"])).toBe("Area finished");
    });
});

describe("latestNotifications", () => {
    it("merges events and overdue work orders, newest first, with unread flags", async () => {
        vi.mocked(prisma.workOrderEvent.findMany).mockResolvedValue([
            event({ id: "new", createdAt: new Date("2026-11-06T10:00:00Z") }),
            event({ id: "old", type: "OPENED", detail: null, createdAt: new Date("2026-11-04T10:00:00Z") }),
        ] as never);
        vi.mocked(prisma.workOrder.findMany).mockResolvedValue([
            { ...workOrder, id: "wo2", dueDate: new Date("2026-11-04T00:00:00Z") },
        ] as never);

        const items = await latestNotifications(viewer(), 5);

        expect(items.map((item) => item.id)).toEqual(["new", "overdue-wo2", "old"]);
        expect(items[0]).toEqual({
            id: "new",
            workOrderId: "wo1",
            jobNumber: "2026-1001",
            title: "Leaky faucet",
            tag: { label: "Completed", tone: "completed" },
            text: "Marcus Hill marked the work complete",
            at: "2026-11-06T10:00:00.000Z",
            fullTime: "November 6, 2026 5:00AM",
            unread: true,
        });
        // Due Nov 4, so overdue from Nov 5, before the user looked at 10 AM on Nov 5. No time of day for overdue.
        expect(items[1]).toMatchObject({
            tag: { label: "Overdue" },
            text: "Was due Nov 4, 2026",
            fullTime: "November 5, 2026",
            unread: false,
        });
        expect(items[2]).toMatchObject({ text: "Marcus Hill opened the work order", unread: false });
    });

    it("keeps only the limit", async () => {
        vi.mocked(prisma.workOrderEvent.findMany).mockResolvedValue([
            event({ id: "a" }),
            event({ id: "b", createdAt: new Date("2026-11-05T10:00:00Z") }),
        ] as never);

        expect((await latestNotifications(viewer(), 1)).map((item) => item.id)).toEqual(["a"]);
    });
});

describe("notificationsPage", () => {
    const at = (day: number) => new Date(`2026-11-${String(day).padStart(2, "0")}T10:00:00Z`);

    beforeEach(() => {
        // Events on Nov 6, 4, 2; work orders due Oct 31, Nov 2 (overdue from Nov 1, Nov 3).
        vi.mocked(prisma.workOrderEvent.findMany).mockResolvedValue(
            [6, 4, 2].map((day) => event({ id: `e${day}`, createdAt: at(day) })) as never,
        );
        vi.mocked(prisma.workOrder.findMany).mockResolvedValue([
            { ...workOrder, id: "due2", dueDate: new Date("2026-11-02T00:00:00Z") },
            { ...workOrder, id: "due31", dueDate: new Date("2026-10-31T00:00:00Z") },
        ] as never);
    });

    it("reads each source to the end of the page plus one, and slices the merged list", async () => {
        const page = await notificationsPage(viewer(), { offset: 2, limit: 2 });

        expect(page.items.map((item) => item.id)).toEqual(["overdue-due2", "e2"]);
        expect(page.hasMore).toBe(true);
        expect(prisma.workOrderEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5 }));
        expect(prisma.workOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5 }));
    });

    it("has no more on the last page", async () => {
        const page = await notificationsPage(viewer(), { offset: 4, limit: 2 });

        expect(page.items.map((item) => item.id)).toEqual(["overdue-due31"]);
        expect(page.hasMore).toBe(false);
    });

    it("is empty past the end", async () => {
        expect(await notificationsPage(viewer(), { offset: 10, limit: 2 })).toEqual({ items: [], hasMore: false });
    });
});

describe("markNotificationsSeen", () => {
    it("sets the seen time on this user's membership in this organization", async () => {
        const now = new Date("2026-11-07T12:00:00Z");
        await markNotificationsSeen(viewer(), now);

        expect(prisma.membership.updateMany).toHaveBeenCalledWith({
            where: { userId: "user1", organizationId: "org1" },
            data: { notificationsSeenAt: now },
        });
    });
});
