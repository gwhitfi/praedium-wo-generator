import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
    default: {
        property: { findFirst: vi.fn(), update: vi.fn() },
        workOrder: { findMany: vi.fn(), updateMany: vi.fn() },
        $transaction: vi.fn(),
    },
}));
vi.mock("@/lib/emails/notifyCancelled", () => ({ notifyContractorsCancelled: vi.fn() }));
vi.mock("@/lib/attachments", () => ({ attachmentKeys: vi.fn(), onWorkOrders: vi.fn() }));
vi.mock("@/lib/storage", () => ({ deleteFiles: vi.fn() }));
vi.mock("@/lib/workOrderEvents", () => ({ logEvents: vi.fn() }));

import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logEvents } from "@/lib/workOrderEvents";
import { archiveProperty } from "./actions";

const user = { id: "user1", firstName: "Justin", lastName: "Whitfield", email: "justin@example.com" };
const actor = { kind: "office", user };

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({
        state: "ready",
        user,
        organization: { id: "org1", name: "Acme Property", email: null, phone: null },
    } as never);
    vi.mocked(prisma.property.findFirst).mockResolvedValue({ id: "prop1", organizationId: "org1" } as never);
});

describe("archiveProperty", () => {
    it("logs what happens to each of the property's work orders", async () => {
        vi.mocked(prisma.workOrder.findMany)
            .mockResolvedValueOnce([]) // contractors to notify
            .mockResolvedValueOnce([
                { id: "draft", status: "DRAFT", archived: false },
                { id: "sent", status: "SENT", archived: false },
                { id: "done", status: "COMPLETED", archived: false },
                { id: "closed", status: "CLOSED", archived: false },
                { id: "old", status: "CANCELLED", archived: true },
            ] as never);

        await archiveProperty("prop1");

        const event = (workOrderId: string) => ({ workOrderId, organizationId: "org1", actor });
        const cancelled = { type: "CANCELLED", detail: { reason: "Property archived" } };
        expect(logEvents).toHaveBeenCalledWith([
            { ...event("draft"), ...cancelled },
            { ...event("draft"), type: "ARCHIVED" },
            { ...event("sent"), ...cancelled },
            { ...event("sent"), type: "ARCHIVED" },
            { ...event("done"), type: "CLOSED" },
            { ...event("done"), type: "ARCHIVED" },
            { ...event("closed"), type: "ARCHIVED" },
        ]);
    });

    it("only reads work orders in the user's organization", async () => {
        vi.mocked(prisma.workOrder.findMany).mockResolvedValue([]);

        await archiveProperty("prop1");

        expect(prisma.workOrder.findMany).toHaveBeenLastCalledWith({
            where: { propertyId: "prop1", organizationId: "org1" },
            select: { id: true, status: true, archived: true },
        });
    });
});
