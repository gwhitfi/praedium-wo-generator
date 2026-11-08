import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
    default: {
        workOrder: { findFirst: vi.fn(), update: vi.fn() },
        unit: { findFirst: vi.fn() },
        contact: { findFirst: vi.fn() },
        area: { findFirst: vi.fn(), create: vi.fn(), delete: vi.fn(), update: vi.fn() },
        lineItem: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
        attachment: { findMany: vi.fn() },
        $transaction: vi.fn(),
    },
}));
vi.mock("@/lib/storage", () => ({ deleteFiles: vi.fn() }));
vi.mock("@/lib/workOrderEvents", () => ({ logEvent: vi.fn() }));
vi.mock("@/lib/workOrderCreate", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/workOrderCreate")>()),
    findTenant: vi.fn(),
}));

import prisma from "@/lib/prisma";
import { deleteFiles } from "@/lib/storage";
import { findTenant } from "@/lib/workOrderCreate";
import { logEvent } from "@/lib/workOrderEvents";
import {
    addLineItem,
    moveArea,
    moveLineItem,
    NOT_EDITABLE_ERROR,
    removeArea,
    removeLineItem,
    renameArea,
    updateLineItem,
    updateLineItemInput,
    updateWorkOrder,
    updateWorkOrderInput,
} from "./workOrderEdit";

const user = { id: "user1", firstName: "Justin", lastName: "W", email: "j@example.com" };
const actor = { kind: "office", user } as const;

function workOrder(overrides: Record<string, unknown> = {}) {
    return {
        id: "wo1",
        organizationId: "org1",
        jobNumber: "2026-1001",
        status: "SENT",
        archived: false,
        propertyId: "prop1",
        unitId: "unit1",
        title: "Fix leak",
        notes: null,
        dueDate: new Date("2026-11-20"),
        notifyTenant: false,
        inHouse: false,
        contractorId: "joes",
        contractorName: "Joe's Plumbing",
        publicToken: "old-token",
        deliveryMethod: "EMAIL",
        ...overrides,
    };
}

const ace = { id: "ace", displayName: "Ace Electric", phone: "8645550111", email: "ace@example.com" };
const tenant = { id: "tenant2", displayName: "Bo Diaz", phone: "8645550122", email: null };

function lineItem(status = "SENT", overrides: Record<string, unknown> = {}) {
    return {
        id: "li1",
        description: "Replace trap",
        priority: "MEDIUM",
        areaId: "area1",
        area: { id: "area1", name: "Kitchen", workOrderId: "wo1", workOrder: workOrder({ status }) },
        ...overrides,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.workOrder.update).mockResolvedValue({} as never);
    vi.mocked(prisma.attachment.findMany).mockResolvedValue([{ storageKey: "org/org1/photo.jpg" }] as never);
});

describe("updateWorkOrderInput", () => {
    it("needs at least one field besides id and turns blank notes into null", () => {
        expect(updateWorkOrderInput.safeParse({ id: "wo1" }).success).toBe(false);
        expect(updateWorkOrderInput.parse({ id: "wo1", notes: "  " })).toEqual({ id: "wo1", notes: null });
        expect(updateWorkOrderInput.parse({ id: "wo1", contractorId: null })).toEqual({
            id: "wo1",
            contractorId: null,
        });
        expect(updateWorkOrderInput.safeParse({ id: "wo1", dueDate: "11/20/2026" }).success).toBe(false);
    });
});

describe("updateWorkOrder", () => {
    it("looks the work order up in the key's organization only", async () => {
        vi.mocked(prisma.workOrder.findFirst).mockResolvedValue(null);
        await expect(updateWorkOrder("org1", user, { id: "other", title: "x" })).resolves.toEqual({
            ok: false,
            error: "No work order with that id was found.",
        });
        expect(vi.mocked(prisma.workOrder.findFirst).mock.calls[0][0]).toEqual({
            where: { id: "other", organizationId: "org1" },
        });
        expect(prisma.workOrder.update).not.toHaveBeenCalled();
    });

    it.each([{ status: "COMPLETED" }, { status: "CLOSED" }, { status: "CANCELLED" }, { archived: true }])(
        "refuses a work order that isn't open: %o",
        async (overrides) => {
            vi.mocked(prisma.workOrder.findFirst).mockResolvedValue(workOrder(overrides) as never);
            await expect(updateWorkOrder("org1", user, { id: "wo1", title: "x" })).resolves.toEqual({
                ok: false,
                error: NOT_EDITABLE_ERROR,
            });
            expect(prisma.workOrder.update).not.toHaveBeenCalled();
        },
    );

    it("changes the contractor on a sent work order with a new link and a CONTRACTOR_CHANGED event", async () => {
        vi.mocked(prisma.workOrder.findFirst).mockResolvedValue(workOrder() as never);
        vi.mocked(prisma.contact.findFirst).mockResolvedValue(ace as never);

        const result = await updateWorkOrder("org1", user, { id: "wo1", contractorId: "ace" });

        expect(result).toEqual({
            ok: true,
            workOrder: { id: "wo1", jobNumber: "2026-1001", status: "SENT" },
            changed: ["contractor"],
            newContractorLink: true,
        });
        expect(vi.mocked(prisma.contact.findFirst).mock.calls[0][0]).toEqual({
            where: { id: "ace", organizationId: "org1", archived: false, contactType: { in: ["CONTRACTOR", "OTHER"] } },
        });
        const data = vi.mocked(prisma.workOrder.update).mock.calls[0][0].data;
        expect(data).toMatchObject({
            contractorId: "ace",
            contractorName: "Ace Electric",
            contractorPhone: "8645550111",
            contractorEmail: "ace@example.com",
            deliveryMethod: null,
        });
        expect(data.publicToken).toEqual(expect.any(String));
        expect(data.publicToken).not.toBe("old-token");
        expect(logEvent).toHaveBeenCalledTimes(1);
        expect(logEvent).toHaveBeenCalledWith({
            type: "CONTRACTOR_CHANGED",
            workOrderId: "wo1",
            organizationId: "org1",
            actor,
            detail: { from: "Joe's Plumbing", to: "Ace Electric" },
        });
    });

    it("hands a sent work order to the office: drops the contractor, kills the link, logs it", async () => {
        vi.mocked(prisma.workOrder.findFirst).mockResolvedValue(workOrder() as never);

        const result = await updateWorkOrder("org1", user, { id: "wo1", inHouse: true });

        expect(result).toMatchObject({ ok: true, changed: ["contractor"], newContractorLink: true });
        expect(prisma.contact.findFirst).not.toHaveBeenCalled();
        const data = vi.mocked(prisma.workOrder.update).mock.calls[0][0].data;
        expect(data).toMatchObject({ inHouse: true, contractorId: null, contractorName: null, contractorEmail: null });
        expect(data.publicToken).not.toBe("old-token");
        expect(logEvent).toHaveBeenCalledWith(
            expect.objectContaining({ type: "CONTRACTOR_CHANGED", detail: { from: "Joe's Plumbing", to: "In-house" } }),
        );
    });

    it("hands an in-house work order to a contractor, which ends in-house", async () => {
        vi.mocked(prisma.workOrder.findFirst).mockResolvedValue(
            workOrder({ inHouse: true, contractorId: null, contractorName: null, status: "IN_PROGRESS" }) as never,
        );
        vi.mocked(prisma.contact.findFirst).mockResolvedValue(ace as never);

        const result = await updateWorkOrder("org1", user, { id: "wo1", contractorId: "ace" });

        expect(result).toMatchObject({ ok: true, changed: ["contractor"], newContractorLink: true });
        const data = vi.mocked(prisma.workOrder.update).mock.calls[0][0].data;
        expect(data).toMatchObject({ inHouse: false, contractorId: "ace", contractorName: "Ace Electric" });
        expect(logEvent).toHaveBeenCalledWith(
            expect.objectContaining({ detail: { from: "In-house", to: "Ace Electric" } }),
        );
    });

    it("won't take a contractor and inHouse: true together", () => {
        expect(updateWorkOrderInput.safeParse({ id: "wo1", inHouse: true, contractorId: "ace" }).success).toBe(false);
        expect(updateWorkOrderInput.safeParse({ id: "wo1", inHouse: false, contractorId: "ace" }).success).toBe(true);
    });

    it("changes the contractor on a draft without a new link or any event", async () => {
        vi.mocked(prisma.workOrder.findFirst).mockResolvedValue(workOrder({ status: "DRAFT" }) as never);
        vi.mocked(prisma.contact.findFirst).mockResolvedValue(ace as never);

        const result = await updateWorkOrder("org1", user, { id: "wo1", contractorId: "ace", title: "New title" });

        expect(result).toMatchObject({ ok: true, changed: ["title", "contractor"], newContractorLink: false });
        const data = vi.mocked(prisma.workOrder.update).mock.calls[0][0].data;
        expect(data).toMatchObject({ contractorId: "ace", title: "New title" });
        expect(data).not.toHaveProperty("publicToken");
        expect(logEvent).not.toHaveBeenCalled();
    });

    it("refuses an unknown contractor or a unit from another property", async () => {
        vi.mocked(prisma.workOrder.findFirst).mockResolvedValue(workOrder() as never);
        vi.mocked(prisma.contact.findFirst).mockResolvedValue(null);
        await expect(updateWorkOrder("org1", user, { id: "wo1", contractorId: "nope" })).resolves.toEqual({
            ok: false,
            error: "That contractor wasn't found.",
        });

        vi.mocked(prisma.unit.findFirst).mockResolvedValue(null);
        await expect(updateWorkOrder("org1", user, { id: "wo1", unitId: "unit9" })).resolves.toEqual({
            ok: false,
            error: "That unit wasn't found on this work order's property.",
        });
        expect(vi.mocked(prisma.unit.findFirst).mock.calls[0][0]).toEqual({
            where: { id: "unit9", propertyId: "prop1", organizationId: "org1", archived: false },
        });
        expect(prisma.workOrder.update).not.toHaveBeenCalled();
    });

    it("re-copies the tenant when the unit changes and logs only the fields that changed", async () => {
        vi.mocked(prisma.workOrder.findFirst).mockResolvedValue(workOrder() as never);
        vi.mocked(prisma.unit.findFirst).mockResolvedValue({ id: "unit2" } as never);
        vi.mocked(findTenant).mockResolvedValue(tenant as never);

        const result = await updateWorkOrder("org1", user, {
            id: "wo1",
            unitId: "unit2",
            title: "Fix leak",
            dueDate: "2026-11-20",
            notes: "Call first",
        });

        expect(result).toMatchObject({ ok: true, changed: ["notes", "unit"], newContractorLink: false });
        expect(findTenant).toHaveBeenCalledWith("unit2", "org1");
        expect(vi.mocked(prisma.workOrder.update).mock.calls[0][0]).toMatchObject({
            where: { id: "wo1" },
            data: {
                unitId: "unit2",
                notes: "Call first",
                dueDate: new Date("2026-11-20T00:00:00.000Z"),
                tenantId: "tenant2",
                tenantName: "Bo Diaz",
                tenantPhone: "8645550122",
                tenantEmail: null,
            },
        });
        expect(logEvent).toHaveBeenCalledTimes(1);
        expect(logEvent).toHaveBeenCalledWith({
            type: "EDITED",
            workOrderId: "wo1",
            organizationId: "org1",
            actor,
            detail: { fields: ["notes", "unit"] },
        });
    });

    it("clears the due date and logs nothing when nothing actually changed", async () => {
        vi.mocked(prisma.workOrder.findFirst).mockResolvedValue(workOrder() as never);

        await updateWorkOrder("org1", user, { id: "wo1", dueDate: null });
        expect(vi.mocked(prisma.workOrder.update).mock.calls[0][0].data).toMatchObject({ dueDate: null });
        expect(logEvent).toHaveBeenLastCalledWith(expect.objectContaining({ detail: { fields: ["dueDate"] } }));

        vi.mocked(logEvent).mockClear();
        vi.mocked(prisma.unit.findFirst).mockResolvedValue({ id: "unit1" } as never);
        await updateWorkOrder("org1", user, { id: "wo1", title: "Fix leak", unitId: "unit1", notifyTenant: false });
        expect(logEvent).not.toHaveBeenCalled();
        expect(findTenant).not.toHaveBeenCalled();
    });
});

describe("addLineItem", () => {
    const areas = [
        { id: "area1", name: "Kitchen", sortOrder: 0 },
        { id: "area2", name: "Bathroom", sortOrder: 3 },
    ];

    beforeEach(() => {
        vi.mocked(prisma.lineItem.create).mockResolvedValue({ id: "li9" } as never);
    });

    it("adds to an existing area matched without regard to case", async () => {
        vi.mocked(prisma.workOrder.findFirst).mockResolvedValue({ ...workOrder(), areas } as never);
        vi.mocked(prisma.lineItem.findFirst).mockResolvedValue({ sortOrder: 4 } as never);

        const result = await addLineItem("org1", user, {
            workOrderId: "wo1",
            area: "kitchen",
            description: "Fix drawer",
            priority: "LOW",
        });

        expect(result).toEqual({
            ok: true,
            lineItem: { id: "li9", areaId: "area1", areaName: "Kitchen", areaCreated: false },
        });
        expect(vi.mocked(prisma.workOrder.findFirst).mock.calls[0][0]).toMatchObject({
            where: { id: "wo1", organizationId: "org1" },
        });
        expect(prisma.area.create).not.toHaveBeenCalled();
        expect(prisma.lineItem.create).toHaveBeenCalledWith({
            data: { areaId: "area1", description: "Fix drawer", priority: "LOW", sortOrder: 5 },
        });
        expect(logEvent).toHaveBeenCalledTimes(1);
        expect(logEvent).toHaveBeenCalledWith({
            type: "ITEM_ADDED",
            workOrderId: "wo1",
            organizationId: "org1",
            actor,
            detail: { item: "Fix drawer", area: "Kitchen" },
        });
    });

    it("creates the area at the end when none matches, and logs both events", async () => {
        vi.mocked(prisma.workOrder.findFirst).mockResolvedValue({ ...workOrder(), areas } as never);
        vi.mocked(prisma.area.create).mockResolvedValue({ id: "area3", name: "Garage", sortOrder: 4 } as never);

        const result = await addLineItem("org1", user, {
            workOrderId: "wo1",
            area: "Garage",
            description: "Fix door",
            priority: "HIGH",
        });

        expect(result).toEqual({
            ok: true,
            lineItem: { id: "li9", areaId: "area3", areaName: "Garage", areaCreated: true },
        });
        expect(prisma.area.create).toHaveBeenCalledWith({ data: { workOrderId: "wo1", name: "Garage", sortOrder: 4 } });
        expect(prisma.lineItem.create).toHaveBeenCalledWith({
            data: { areaId: "area3", description: "Fix door", priority: "HIGH", sortOrder: 0 },
        });
        expect(vi.mocked(logEvent).mock.calls.map(([event]) => event.type)).toEqual(["AREA_ADDED", "ITEM_ADDED"]);
    });

    it("logs nothing on a draft and refuses a closed work order", async () => {
        vi.mocked(prisma.workOrder.findFirst).mockResolvedValue({ ...workOrder({ status: "DRAFT" }), areas } as never);
        vi.mocked(prisma.lineItem.findFirst).mockResolvedValue(null);
        const input = { workOrderId: "wo1", area: "Kitchen", description: "Fix", priority: "LOW" } as const;

        await expect(addLineItem("org1", user, input)).resolves.toMatchObject({ ok: true });
        expect(logEvent).not.toHaveBeenCalled();

        vi.mocked(prisma.workOrder.findFirst).mockResolvedValue({ ...workOrder({ status: "CLOSED" }), areas } as never);
        await expect(addLineItem("org1", user, input)).resolves.toEqual({ ok: false, error: NOT_EDITABLE_ERROR });
        expect(prisma.lineItem.create).toHaveBeenCalledTimes(1);
    });
});

describe("updateLineItem", () => {
    it("needs a description or a priority", () => {
        expect(updateLineItemInput.safeParse({ lineItemId: "li1" }).success).toBe(false);
        expect(updateLineItemInput.safeParse({ lineItemId: "li1", priority: "HIGH" }).success).toBe(true);
    });

    it("updates only the given field and logs ITEM_EDITED like the office action", async () => {
        vi.mocked(prisma.lineItem.findFirst).mockResolvedValue(lineItem() as never);

        const result = await updateLineItem("org1", user, { lineItemId: "li1", priority: "HIGH" });

        expect(result).toEqual({ ok: true, lineItem: { id: "li1", description: "Replace trap", priority: "HIGH" } });
        expect(vi.mocked(prisma.lineItem.findFirst).mock.calls[0][0]).toMatchObject({
            where: { id: "li1", area: { workOrder: { organizationId: "org1" } } },
        });
        expect(prisma.lineItem.update).toHaveBeenCalledWith({
            where: { id: "li1" },
            data: { description: undefined, priority: "HIGH" },
        });
        expect(logEvent).toHaveBeenCalledWith({
            type: "ITEM_EDITED",
            workOrderId: "wo1",
            organizationId: "org1",
            actor,
            detail: { item: "Replace trap", area: "Kitchen", priority: { from: "MEDIUM", to: "HIGH" } },
        });
    });

    it("logs nothing when nothing changed or on a draft", async () => {
        vi.mocked(prisma.lineItem.findFirst).mockResolvedValue(lineItem() as never);
        await updateLineItem("org1", user, { lineItemId: "li1", description: "Replace trap" });

        vi.mocked(prisma.lineItem.findFirst).mockResolvedValue(lineItem("DRAFT") as never);
        await updateLineItem("org1", user, { lineItemId: "li1", description: "New text" });

        expect(logEvent).not.toHaveBeenCalled();
    });

    it("returns an error for a line item outside the organization", async () => {
        vi.mocked(prisma.lineItem.findFirst).mockResolvedValue(null);
        await expect(updateLineItem("org1", user, { lineItemId: "x", priority: "LOW" })).resolves.toEqual({
            ok: false,
            error: "No line item with that id was found.",
        });
        expect(prisma.lineItem.update).not.toHaveBeenCalled();
    });
});

describe("removeLineItem", () => {
    it("collects the photo keys before deleting and deletes the files after", async () => {
        vi.mocked(prisma.lineItem.findFirst).mockResolvedValue(lineItem() as never);
        const order: string[] = [];
        vi.mocked(prisma.attachment.findMany).mockImplementation((async () => {
            order.push("keys");
            return [{ storageKey: "org/org1/photo.jpg" }];
        }) as never);
        vi.mocked(prisma.lineItem.delete).mockImplementation((async () => order.push("delete")) as never);
        vi.mocked(deleteFiles).mockImplementation(async () => {
            order.push("files");
        });

        await expect(removeLineItem("org1", user, { lineItemId: "li1" })).resolves.toEqual({ ok: true });

        expect(order).toEqual(["keys", "delete", "files"]);
        expect(vi.mocked(prisma.attachment.findMany).mock.calls[0][0]).toMatchObject({
            where: { lineItemId: "li1", organizationId: "org1" },
        });
        expect(deleteFiles).toHaveBeenCalledWith(["org/org1/photo.jpg"]);
        expect(logEvent).toHaveBeenCalledWith({
            type: "ITEM_REMOVED",
            workOrderId: "wo1",
            organizationId: "org1",
            actor,
            detail: { item: "Replace trap", area: "Kitchen" },
        });
    });

    it("refuses on an archived work order and skips the event on a draft", async () => {
        const archived = lineItem();
        archived.area.workOrder.archived = true;
        vi.mocked(prisma.lineItem.findFirst).mockResolvedValue(archived as never);
        await expect(removeLineItem("org1", user, { lineItemId: "li1" })).resolves.toEqual({
            ok: false,
            error: NOT_EDITABLE_ERROR,
        });
        expect(prisma.lineItem.delete).not.toHaveBeenCalled();

        vi.mocked(prisma.lineItem.findFirst).mockResolvedValue(lineItem("DRAFT") as never);
        await removeLineItem("org1", user, { lineItemId: "li1" });
        expect(prisma.lineItem.delete).toHaveBeenCalledTimes(1);
        expect(logEvent).not.toHaveBeenCalled();
    });
});

describe("removeArea", () => {
    const area = { id: "area1", name: "Kitchen", workOrderId: "wo1", workOrder: workOrder() };

    it("scopes the lookup, collects its line items' photo keys, deletes, then deletes the files", async () => {
        vi.mocked(prisma.area.findFirst).mockResolvedValue(area as never);

        await expect(removeArea("org1", user, { areaId: "area1" })).resolves.toEqual({ ok: true });

        expect(vi.mocked(prisma.area.findFirst).mock.calls[0][0]).toMatchObject({
            where: { id: "area1", workOrder: { organizationId: "org1" } },
        });
        expect(vi.mocked(prisma.attachment.findMany).mock.calls[0][0]).toMatchObject({
            where: { lineItem: { areaId: "area1" }, organizationId: "org1" },
        });
        expect(prisma.area.delete).toHaveBeenCalledWith({ where: { id: "area1" } });
        expect(vi.mocked(prisma.attachment.findMany).mock.invocationCallOrder[0]).toBeLessThan(
            vi.mocked(prisma.area.delete).mock.invocationCallOrder[0],
        );
        expect(vi.mocked(prisma.area.delete).mock.invocationCallOrder[0]).toBeLessThan(
            vi.mocked(deleteFiles).mock.invocationCallOrder[0],
        );
        expect(logEvent).toHaveBeenCalledWith({
            type: "AREA_REMOVED",
            workOrderId: "wo1",
            organizationId: "org1",
            actor,
            detail: { area: "Kitchen" },
        });
    });

    it("returns an error for an unknown area and refuses a cancelled work order", async () => {
        vi.mocked(prisma.area.findFirst).mockResolvedValue(null);
        await expect(removeArea("org1", user, { areaId: "x" })).resolves.toEqual({
            ok: false,
            error: "No area with that id was found.",
        });

        vi.mocked(prisma.area.findFirst).mockResolvedValue({
            ...area,
            workOrder: workOrder({ status: "CANCELLED" }),
        } as never);
        await expect(removeArea("org1", user, { areaId: "area1" })).resolves.toEqual({
            ok: false,
            error: NOT_EDITABLE_ERROR,
        });
        expect(prisma.area.delete).not.toHaveBeenCalled();
        expect(deleteFiles).not.toHaveBeenCalled();
    });
});

describe("renameArea", () => {
    const area = (status = "SENT") => ({
        id: "area1",
        name: "Kitchen",
        workOrderId: "wo1",
        workOrder: workOrder({ status }),
    });

    it("renames an area in the organization and logs AREA_RENAMED", async () => {
        vi.mocked(prisma.area.findFirst).mockResolvedValue(area() as never);

        await expect(renameArea("org1", user, { areaId: "area1", name: "Pantry" })).resolves.toEqual({
            ok: true,
            area: { id: "area1", name: "Pantry" },
        });
        expect(vi.mocked(prisma.area.findFirst).mock.calls[0][0]).toMatchObject({
            where: { id: "area1", workOrder: { organizationId: "org1" } },
        });
        expect(prisma.area.update).toHaveBeenCalledWith({ where: { id: "area1" }, data: { name: "Pantry" } });
        expect(logEvent).toHaveBeenCalledWith({
            type: "AREA_RENAMED",
            workOrderId: "wo1",
            organizationId: "org1",
            actor,
            detail: { from: "Kitchen", to: "Pantry" },
        });
    });

    it("saves nothing when the name is the same, logs nothing on a draft and refuses a closed work order", async () => {
        vi.mocked(prisma.area.findFirst).mockResolvedValue(area() as never);
        await renameArea("org1", user, { areaId: "area1", name: "Kitchen" });
        expect(prisma.area.update).not.toHaveBeenCalled();

        vi.mocked(prisma.area.findFirst).mockResolvedValue(area("DRAFT") as never);
        await renameArea("org1", user, { areaId: "area1", name: "Pantry" });
        expect(prisma.area.update).toHaveBeenCalledTimes(1);
        expect(logEvent).not.toHaveBeenCalled();

        vi.mocked(prisma.area.findFirst).mockResolvedValue(area("CLOSED") as never);
        await expect(renameArea("org1", user, { areaId: "area1", name: "Yard" })).resolves.toEqual({
            ok: false,
            error: NOT_EDITABLE_ERROR,
        });
        expect(prisma.area.update).toHaveBeenCalledTimes(1);
    });
});

// $transaction gets the list of update calls; the mocked updates return their arguments so the order can be read.
function transactionUpdates(): unknown[] {
    return vi.mocked(prisma.$transaction).mock.calls[0][0] as unknown as unknown[];
}

describe("moveArea", () => {
    const areas = [{ id: "a1" }, { id: "a2" }, { id: "a3" }];

    beforeEach(() => {
        vi.mocked(prisma.area.update).mockImplementation(((args: unknown) => args) as never);
        vi.mocked(prisma.$transaction).mockResolvedValue([] as never);
    });

    it("moves the area to the position and renumbers every area", async () => {
        vi.mocked(prisma.area.findFirst).mockResolvedValue({
            id: "a3",
            workOrder: { ...workOrder(), areas },
        } as never);

        await expect(moveArea("org1", { areaId: "a3", position: 1 })).resolves.toEqual({
            ok: true,
            area: { id: "a3", position: 1 },
        });
        expect(vi.mocked(prisma.area.findFirst).mock.calls[0][0]).toMatchObject({
            where: { id: "a3", workOrder: { organizationId: "org1" } },
        });
        expect(transactionUpdates()).toEqual([
            { where: { id: "a3" }, data: { sortOrder: 0 } },
            { where: { id: "a1" }, data: { sortOrder: 1 } },
            { where: { id: "a2" }, data: { sortOrder: 2 } },
        ]);
        expect(logEvent).not.toHaveBeenCalled();
    });

    it("clamps a position past the end to last", async () => {
        vi.mocked(prisma.area.findFirst).mockResolvedValue({
            id: "a1",
            workOrder: { ...workOrder(), areas },
        } as never);

        await expect(moveArea("org1", { areaId: "a1", position: 99 })).resolves.toEqual({
            ok: true,
            area: { id: "a1", position: 3 },
        });
        expect(transactionUpdates()).toEqual([
            { where: { id: "a2" }, data: { sortOrder: 0 } },
            { where: { id: "a3" }, data: { sortOrder: 1 } },
            { where: { id: "a1" }, data: { sortOrder: 2 } },
        ]);
    });

    it("refuses an archived work order and an unknown area", async () => {
        vi.mocked(prisma.area.findFirst).mockResolvedValue({
            id: "a1",
            workOrder: { ...workOrder({ archived: true }), areas },
        } as never);
        await expect(moveArea("org1", { areaId: "a1", position: 2 })).resolves.toEqual({
            ok: false,
            error: NOT_EDITABLE_ERROR,
        });

        vi.mocked(prisma.area.findFirst).mockResolvedValue(null);
        await expect(moveArea("org1", { areaId: "x", position: 2 })).resolves.toEqual({
            ok: false,
            error: "No area with that id was found.",
        });
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });
});

describe("moveLineItem", () => {
    beforeEach(() => {
        vi.mocked(prisma.lineItem.update).mockImplementation(((args: unknown) => args) as never);
        vi.mocked(prisma.$transaction).mockResolvedValue([] as never);
        vi.mocked(prisma.lineItem.findFirst).mockResolvedValue(lineItem() as never);
    });

    it("moves a line item within its area", async () => {
        vi.mocked(prisma.lineItem.findMany).mockResolvedValue([{ id: "li2" }, { id: "li3" }] as never);

        await expect(moveLineItem("org1", { lineItemId: "li1", position: 2 })).resolves.toEqual({
            ok: true,
            lineItem: { id: "li1", areaId: "area1", position: 2 },
        });
        expect(vi.mocked(prisma.lineItem.findMany).mock.calls[0][0]).toMatchObject({
            where: { areaId: "area1", NOT: { id: "li1" } },
        });
        expect(prisma.area.findFirst).not.toHaveBeenCalled();
        expect(transactionUpdates()).toEqual([
            { where: { id: "li2" }, data: { sortOrder: 0 } },
            { where: { id: "li1" }, data: { areaId: "area1", sortOrder: 1 } },
            { where: { id: "li3" }, data: { sortOrder: 2 } },
        ]);
        expect(logEvent).not.toHaveBeenCalled();
    });

    it("moves a line item into another area of the same work order and renumbers both", async () => {
        vi.mocked(prisma.area.findFirst).mockResolvedValue({ id: "area2" } as never);
        vi.mocked(prisma.lineItem.findMany)
            .mockResolvedValueOnce([{ id: "li7" }] as never)
            .mockResolvedValueOnce([{ id: "li2" }, { id: "li3" }] as never);

        await expect(moveLineItem("org1", { lineItemId: "li1", position: 1, areaId: "area2" })).resolves.toEqual({
            ok: true,
            lineItem: { id: "li1", areaId: "area2", position: 1 },
        });
        expect(prisma.area.findFirst).toHaveBeenCalledWith({ where: { id: "area2", workOrderId: "wo1" } });
        expect(transactionUpdates()).toEqual([
            { where: { id: "li1" }, data: { areaId: "area2", sortOrder: 0 } },
            { where: { id: "li7" }, data: { sortOrder: 1 } },
            { where: { id: "li2" }, data: { sortOrder: 0 } },
            { where: { id: "li3" }, data: { sortOrder: 1 } },
        ]);
    });

    it("refuses an area from another work order and a line item that isn't editable", async () => {
        vi.mocked(prisma.area.findFirst).mockResolvedValue(null);
        await expect(moveLineItem("org1", { lineItemId: "li1", position: 1, areaId: "elsewhere" })).resolves.toEqual({
            ok: false,
            error: "That area isn't on this line item's work order.",
        });

        vi.mocked(prisma.lineItem.findFirst).mockResolvedValue(lineItem("COMPLETED") as never);
        await expect(moveLineItem("org1", { lineItemId: "li1", position: 1 })).resolves.toEqual({
            ok: false,
            error: NOT_EDITABLE_ERROR,
        });
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });
});
