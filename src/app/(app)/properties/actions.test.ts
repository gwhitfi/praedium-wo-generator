import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
    default: {
        property: { findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
        unit: { findFirst: vi.fn(), count: vi.fn(), delete: vi.fn() },
        contact: { updateMany: vi.fn() },
        workOrder: { findMany: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
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
import { cookies } from "next/headers";
import { archiveProperty, deleteProperty, deleteUnit, setGroupByType } from "./actions";

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

describe("setGroupByType", () => {
    it("saves the choice in a cookie for the properties list", async () => {
        const set = vi.fn();
        vi.mocked(cookies).mockResolvedValue({ set } as never);

        await setGroupByType(true);
        await setGroupByType(false);

        expect(set.mock.calls.map((call) => [call[0], call[1], call[2].path])).toEqual([
            ["prop-group-by-type", "1", "/properties"],
            ["prop-group-by-type", "0", "/properties"],
        ]);
    });

    it("refuses anything but a boolean, and signed-out callers", async () => {
        vi.mocked(cookies).mockResolvedValue({ set: vi.fn() } as never);
        await expect(setGroupByType("yes" as unknown as boolean)).rejects.toThrow();

        vi.mocked(getCurrentUser).mockResolvedValue({ state: "signed-out" } as never);
        await expect(setGroupByType(true)).rejects.toThrow("Not authorized");
    });
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

// The bulk statements in the two deletes once filtered only by the ID the caller sent (finding N-1). Each one now
// names the looked-up record and the organization.
describe("deleteProperty", () => {
    it("scopes every statement to the looked-up property and the organization", async () => {
        vi.mocked(prisma.workOrder.findMany).mockResolvedValue([]);

        await expect(deleteProperty("prop1", "yes")).resolves.toBeUndefined();

        const onProperty = { propertyId: "prop1", organizationId: "org1" };
        expect(prisma.workOrder.findMany).toHaveBeenCalledWith({
            where: { ...onProperty, archived: false, status: { in: ["SENT", "IN_PROGRESS"] } },
            include: { unit: true },
        });
        expect(prisma.contact.updateMany).toHaveBeenCalledWith({
            where: { organizationId: "org1", unit: { propertyId: "prop1" } },
            data: { unitId: null },
        });
        expect(prisma.workOrder.deleteMany).toHaveBeenCalledWith({ where: onProperty });
        expect(prisma.property.delete).toHaveBeenCalledWith({ where: { id: "prop1", organizationId: "org1" } });
    });

    it("refuses a property from another organization before changing anything", async () => {
        vi.mocked(prisma.property.findFirst).mockResolvedValue(null);

        expect(await deleteProperty("prop2", "yes")).toEqual({ ok: false, error: "Property not found." });
        expect(prisma.property.findFirst).toHaveBeenCalledWith({ where: { id: "prop2", organizationId: "org1" } });
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });
});

describe("deleteUnit", () => {
    it("scopes every statement to the looked-up unit and the organization", async () => {
        vi.mocked(prisma.unit.findFirst).mockResolvedValue({
            id: "unit1",
            propertyId: "prop1",
            organizationId: "org1",
            property: { id: "prop1" },
        } as never);
        vi.mocked(prisma.unit.count).mockResolvedValue(2);
        vi.mocked(prisma.workOrder.findMany).mockResolvedValue([]);

        expect(await deleteUnit("unit1", "yes")).toEqual({ ok: true });

        const onUnit = { unitId: "unit1", organizationId: "org1" };
        expect(prisma.unit.count).toHaveBeenCalledWith({
            where: { propertyId: "prop1", organizationId: "org1", archived: false },
        });
        expect(prisma.workOrder.findMany).toHaveBeenCalledWith({
            where: { ...onUnit, archived: false, status: { in: ["SENT", "IN_PROGRESS"] } },
        });
        expect(prisma.contact.updateMany).toHaveBeenCalledWith({ where: onUnit, data: { unitId: null } });
        expect(prisma.workOrder.deleteMany).toHaveBeenCalledWith({ where: onUnit });
        expect(prisma.unit.delete).toHaveBeenCalledWith({ where: { id: "unit1", organizationId: "org1" } });
    });
});
