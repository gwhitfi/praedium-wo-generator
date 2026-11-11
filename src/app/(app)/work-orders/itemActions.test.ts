import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
    default: {
        workOrder: { findFirst: vi.fn() },
        area: { findFirst: vi.fn(), create: vi.fn(), delete: vi.fn(), update: vi.fn() },
        lineItem: {
            findFirst: vi.fn(),
            create: vi.fn(),
            delete: vi.fn(),
            update: vi.fn(),
            updateMany: vi.fn(),
        },
        $transaction: vi.fn(),
    },
}));
vi.mock("@/lib/storage", () => ({ deleteFiles: vi.fn() }));
vi.mock("@/lib/attachments", () => ({ attachmentKeys: vi.fn() }));
vi.mock("@/lib/workOrderEvents", () => ({ logEvent: vi.fn() }));

import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logEvent } from "@/lib/workOrderEvents";
import {
    addArea,
    addLineItem,
    moveArea,
    moveLineItem,
    removeArea,
    removeLineItem,
    renameArea,
    setLineItemCompleted,
    updateLineItem,
} from "./itemActions";

const user = { id: "user1", firstName: "Justin", lastName: "Whitfield", email: "justin@example.com" };
const office = { kind: "office", user };
const ids = { workOrderId: "wo1", organizationId: "org1" };
const workOrder = {
    id: "wo1",
    organizationId: "org1",
    publicToken: "token1",
    status: "DRAFT",
    archived: false,
    inHouse: false,
};

function withWorkOrder(changes: Record<string, unknown> = {}) {
    vi.mocked(prisma.workOrder.findFirst).mockResolvedValue({ ...workOrder, ...changes } as never);
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({
        state: "ready",
        user,
        organization: { id: "org1", name: "Acme Property", email: null, phone: null },
    } as never);
    withWorkOrder();
});

describe("in-house work orders", () => {
    const inHouse = {
        inHouse: true,
        contractorId: null,
        contractorName: null,
        contractorEmail: null,
        contractor: null,
    };

    describe("setLineItemCompleted", () => {
        function withItem(workOrderChanges: Record<string, unknown> = {}, completed = false) {
            vi.mocked(prisma.lineItem.findFirst).mockResolvedValue({
                id: "li1",
                description: "Replace faucet",
                completed,
                area: {
                    name: "Kitchen",
                    workOrder: { ...workOrder, ...inHouse, status: "IN_PROGRESS", ...workOrderChanges },
                },
            } as never);
        }

        beforeEach(() => {
            vi.mocked(prisma.lineItem.updateMany).mockResolvedValue({ count: 1 } as never);
        });

        it("checks off an item on a started in-house work order, scoped to the organization, and logs it", async () => {
            withItem();

            await setLineItemCompleted("li1", true);

            expect(prisma.lineItem.findFirst).toHaveBeenCalledWith(
                expect.objectContaining({ where: { id: "li1", area: { workOrder: { organizationId: "org1" } } } }),
            );
            expect(prisma.lineItem.updateMany).toHaveBeenCalledWith({
                where: {
                    id: "li1",
                    area: {
                        workOrder: {
                            id: "wo1",
                            organizationId: "org1",
                            inHouse: true,
                            archived: false,
                            status: { in: ["SENT", "IN_PROGRESS"] },
                        },
                    },
                },
                data: { completed: true, completedAt: expect.any(Date) },
            });
            expect(logEvent).toHaveBeenCalledWith({
                ...ids,
                type: "ITEM_CHECKED",
                actor: office,
                detail: { item: "Replace faucet", area: "Kitchen" },
            });
        });

        it.each([{ inHouse: false }, { status: "DRAFT" }, { status: "COMPLETED" }, { archived: true }])(
            "refuses when the work order isn't a started in-house one (%o)",
            async (changes) => {
                withItem(changes);

                expect(await setLineItemCompleted("li1", true)).toEqual({
                    ok: false,
                    error: "Only started in-house work orders can be checked off here",
                });
                expect(prisma.lineItem.updateMany).not.toHaveBeenCalled();
                expect(logEvent).not.toHaveBeenCalled();
            },
        );

        it("refuses another organization's line item", async () => {
            vi.mocked(prisma.lineItem.findFirst).mockResolvedValue(null);

            await expect(setLineItemCompleted("li1", true)).rejects.toThrow("Invalid line item");
        });
    });
});

describe("areas and line items", () => {
    const kitchen = (status: string) => ({
        id: "area1",
        name: "Kitchen",
        workOrderId: "wo1",
        workOrder: { ...workOrder, status },
    });
    const faucet = (status: string) => ({
        id: "li1",
        description: "Replace faucet",
        priority: "MEDIUM",
        area: kitchen(status),
    });

    function onSent() {
        withWorkOrder({ status: "SENT" });
        vi.mocked(prisma.area.findFirst).mockResolvedValue(kitchen("SENT") as never);
        vi.mocked(prisma.lineItem.findFirst).mockResolvedValue(faucet("SENT") as never);
    }

    it("logs adding and removing an area", async () => {
        onSent();

        await addArea("wo1", "Yard");
        await removeArea("area1");

        expect(vi.mocked(logEvent).mock.calls).toEqual([
            [{ ...ids, type: "AREA_ADDED", actor: office, detail: { area: "Yard" } }],
            [{ ...ids, type: "AREA_REMOVED", actor: office, detail: { area: "Kitchen" } }],
        ]);
    });

    it("renames an area and logs the old and new names", async () => {
        onSent();

        await renameArea("area1", "  Kitchen and pantry  ");

        expect(prisma.area.update).toHaveBeenCalledWith({
            where: { id: "area1" },
            data: { name: "Kitchen and pantry" },
        });
        expect(vi.mocked(logEvent).mock.calls).toEqual([
            [{ ...ids, type: "AREA_RENAMED", actor: office, detail: { from: "Kitchen", to: "Kitchen and pantry" } }],
        ]);
    });

    it("doesn't save or log a rename that changes nothing, and doesn't log one on a draft", async () => {
        onSent();
        await renameArea("area1", " Kitchen ");
        expect(prisma.area.update).not.toHaveBeenCalled();

        vi.mocked(prisma.area.findFirst).mockResolvedValue(kitchen("DRAFT") as never);
        await renameArea("area1", "Pantry");
        expect(prisma.area.update).toHaveBeenCalledTimes(1);
        expect(logEvent).not.toHaveBeenCalled();
    });

    it("rejects a blank or over-long area name, or an area in another organization", async () => {
        onSent();
        expect(await renameArea("area1", "   ")).toEqual({ ok: false, error: "Enter an area name" });
        expect(await renameArea("area1", "x".repeat(101))).toEqual({ ok: false, error: "Use 100 characters or fewer" });

        vi.mocked(prisma.area.findFirst).mockResolvedValue({
            ...kitchen("SENT"),
            workOrder: { ...workOrder, organizationId: "org2" },
        } as never);
        await expect(renameArea("area1", "Pantry")).rejects.toThrow("Invalid area");
        expect(prisma.area.update).not.toHaveBeenCalled();
    });

    it("refuses a blank, over-long or unknown-priority line item before saving", async () => {
        onSent();

        expect(await addLineItem("area1", "  ", "LOW")).toEqual({ ok: false, error: "Describe the work" });
        expect(await addLineItem("area1", "x".repeat(1001), "LOW")).toEqual({
            ok: false,
            error: "Use 1000 characters or fewer",
        });
        expect(await addLineItem("area1", "Fix gate latch", "URGENT" as never)).toEqual({
            ok: false,
            error: "Choose a priority",
        });
        expect(await updateLineItem("li1", "Fix it", "SOON" as never)).toEqual({
            ok: false,
            error: "Choose a priority",
        });
        expect(await addArea("wo1", "x".repeat(101))).toEqual({ ok: false, error: "Use 100 characters or fewer" });
        expect(await moveArea("area1", "sideways" as never)).toMatchObject({ ok: false });

        expect(prisma.lineItem.create).not.toHaveBeenCalled();
        expect(prisma.lineItem.update).not.toHaveBeenCalled();
        expect(prisma.area.create).not.toHaveBeenCalled();
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("trims a line item's description before saving it", async () => {
        onSent();

        expect(await addLineItem("area1", "  Fix gate latch  ", "LOW")).toEqual({ ok: true });
        expect(vi.mocked(prisma.lineItem.create).mock.calls[0][0].data).toMatchObject({
            description: "Fix gate latch",
            priority: "LOW",
        });
    });

    it("logs adding and removing a line item", async () => {
        onSent();

        await addLineItem("area1", "Fix gate latch", "LOW");
        await removeLineItem("li1");

        expect(vi.mocked(logEvent).mock.calls).toEqual([
            [{ ...ids, type: "ITEM_ADDED", actor: office, detail: { item: "Fix gate latch", area: "Kitchen" } }],
            [{ ...ids, type: "ITEM_REMOVED", actor: office, detail: { item: "Replace faucet", area: "Kitchen" } }],
        ]);
    });

    it("logs only what changed in a line item edit", async () => {
        onSent();

        await updateLineItem("li1", "Replace kitchen faucet", "MEDIUM");
        await updateLineItem("li1", "Replace faucet", "HIGH");

        expect(vi.mocked(logEvent).mock.calls).toEqual([
            [
                {
                    ...ids,
                    type: "ITEM_EDITED",
                    actor: office,
                    detail: { item: "Replace kitchen faucet", area: "Kitchen", from: "Replace faucet" },
                },
            ],
            [
                {
                    ...ids,
                    type: "ITEM_EDITED",
                    actor: office,
                    detail: { item: "Replace faucet", area: "Kitchen", priority: { from: "MEDIUM", to: "HIGH" } },
                },
            ],
        ]);
    });

    it("doesn't log a line item edit that changed nothing", async () => {
        onSent();

        await updateLineItem("li1", "Replace faucet", "MEDIUM");

        expect(logEvent).not.toHaveBeenCalled();
    });

    it("doesn't log changes to a draft", async () => {
        vi.mocked(prisma.area.findFirst).mockResolvedValue(kitchen("DRAFT") as never);
        vi.mocked(prisma.lineItem.findFirst).mockResolvedValue(faucet("DRAFT") as never);

        await addArea("wo1", "Yard");
        await removeArea("area1");
        await addLineItem("area1", "Fix gate latch", "LOW");
        await removeLineItem("li1");
        await updateLineItem("li1", "Replace kitchen faucet", "HIGH");

        expect(logEvent).not.toHaveBeenCalled();
    });

    it.each([
        ["completed", { status: "COMPLETED" }],
        ["closed", { status: "CLOSED" }],
        ["cancelled", { status: "CANCELLED" }],
        ["archived", { status: "SENT", archived: true }],
    ])("refuses every change to a %s work order", async (_, changes) => {
        const locked = { ...workOrder, ...changes };
        withWorkOrder(changes);
        vi.mocked(prisma.area.findFirst).mockResolvedValue({ ...kitchen("SENT"), workOrder: locked } as never);
        vi.mocked(prisma.lineItem.findFirst).mockResolvedValue({
            ...faucet("SENT"),
            area: { ...kitchen("SENT"), workOrder: locked },
        } as never);

        const attempts = [
            () => addArea("wo1", "Yard"),
            () => removeArea("area1"),
            () => moveArea("area1", "down"),
            () => renameArea("area1", "Pantry"),
            () => addLineItem("area1", "Fix gate latch", "LOW"),
            () => removeLineItem("li1"),
            () => moveLineItem("li1", "down"),
            () => updateLineItem("li1", "Replace kitchen faucet", "HIGH"),
        ];
        for (const attempt of attempts) {
            expect(await attempt()).toEqual({ ok: false, error: "This work order can't be edited" });
        }

        expect(prisma.area.create).not.toHaveBeenCalled();
        expect(prisma.area.delete).not.toHaveBeenCalled();
        expect(prisma.area.update).not.toHaveBeenCalled();
        expect(prisma.lineItem.create).not.toHaveBeenCalled();
        expect(prisma.lineItem.delete).not.toHaveBeenCalled();
        expect(prisma.lineItem.update).not.toHaveBeenCalled();
        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(logEvent).not.toHaveBeenCalled();
    });
});
