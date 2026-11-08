import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
    default: {
        property: { findFirst: vi.fn() },
        unit: { findFirst: vi.fn() },
        contact: { findFirst: vi.fn() },
        workOrder: { findFirst: vi.fn(), update: vi.fn() },
        area: { findFirst: vi.fn(), create: vi.fn(), delete: vi.fn(), update: vi.fn() },
        lineItem: {
            count: vi.fn(),
            findFirst: vi.fn(),
            create: vi.fn(),
            delete: vi.fn(),
            update: vi.fn(),
            updateMany: vi.fn(),
        },
        $transaction: vi.fn(),
    },
}));
vi.mock("@/lib/email", () => ({ getAppUrl: vi.fn(() => "https://example.com"), sendEmail: vi.fn() }));
vi.mock("@/lib/emails/workOrderEmail", () => ({ workOrderEmail: vi.fn(() => ({ subject: "", html: "", text: "" })) }));
vi.mock("@/lib/emails/notifyCancelled", () => ({ notifyContractorsCancelled: vi.fn() }));
vi.mock("@/lib/emails/notifyTenant", () => ({ notifyTenant: vi.fn(() => false) }));
vi.mock("@/lib/storage", () => ({ deleteFiles: vi.fn(), lineItemPhotoKey: vi.fn(), uploadFile: vi.fn() }));
vi.mock("@/lib/attachments", () => ({ attachmentKeys: vi.fn(), onWorkOrders: vi.fn() }));
vi.mock("@/lib/workOrderCreate", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/workOrderCreate")>()),
    findTenant: vi.fn(),
    nextJobNumber: vi.fn(),
}));
vi.mock("@/lib/workOrderEvents", () => ({ logEvent: vi.fn() }));
vi.mock("@/lib/workOrderStart", () => ({ startInHouseWorkOrder: vi.fn() }));
vi.mock("@/lib/photos", () => ({
    checkPhoto: vi.fn(() => ({ ok: true, type: { mimeType: "image/jpeg" } })),
    MAX_PHOTO_BYTES: 3 * 1024 * 1024,
}));

import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { logEvent } from "@/lib/workOrderEvents";
import { notifyTenant } from "@/lib/emails/notifyTenant";
import { IN_HOUSE } from "@/lib/defaults";
import { startInHouseWorkOrder } from "@/lib/workOrderStart";
import {
    addArea,
    addLineItem,
    archiveWorkOrder,
    cancelWorkOrder,
    closeWorkOrder,
    createWorkOrder,
    emailWorkOrder,
    markWorkOrderCompleted,
    moveArea,
    moveLineItem,
    regeneratePublicToken,
    removeArea,
    removeLineItem,
    removeLineItemPhoto,
    renameArea,
    reopenWorkOrder,
    restoreWorkOrder,
    sendWorkOrder,
    setLineItemCompleted,
    setLineItemPhoto,
    startWorkOrder,
    updateLineItem,
    updateWorkOrder,
} from "./actions";

const user = { id: "user1", firstName: "Justin", lastName: "Whitfield", email: "justin@example.com" };
const office = { kind: "office", user };
const ids = { workOrderId: "wo1", organizationId: "org1" };
const contractor = { id: "joes", displayName: "Joe's Plumbing", phone: null, email: "joe@example.com" };
const workOrder = {
    id: "wo1",
    organizationId: "org1",
    propertyId: "prop1",
    publicToken: "token1",
    status: "DRAFT",
    archived: false,
    title: "Fix sink",
    notes: null,
    dueDate: null,
    unitId: null,
    notifyTenant: false,
    inHouse: false,
    sentAt: null,
    startedAt: null,
    deliveryMethod: null,
    contractorId: "joes",
    contractorName: "Joe's Plumbing",
    contractor,
    contractorEmail: "joe@example.com",
    property: { addressLine1: "12 Oak St", city: "Greenville", state: "SC", zipCode: "29601", archived: false },
    unit: null,
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

describe("createWorkOrder", () => {
    it("logs the work order as created from the form", async () => {
        const create = vi.fn().mockResolvedValue({ id: "wo1" });
        vi.mocked(prisma.property.findFirst).mockResolvedValue({ id: "prop1" } as never);
        vi.mocked(prisma.$transaction).mockImplementation((async (fn: (tx: unknown) => unknown) =>
            fn({ workOrder: { create } })) as never);
        const form = new FormData();
        form.set("propertyId", "prop1");
        form.set("title", "Fix sink");

        await createWorkOrder(form);

        expect(logEvent).toHaveBeenCalledWith({ ...ids, type: "CREATED", actor: office, detail: { source: "form" } });
    });

    it("refuses an archived unit", async () => {
        vi.mocked(prisma.property.findFirst).mockResolvedValue({ id: "prop1" } as never);
        vi.mocked(prisma.unit.findFirst).mockResolvedValue(null);
        const form = new FormData();
        form.set("propertyId", "prop1");
        form.set("unitId", "unit1");
        form.set("title", "Fix sink");

        await expect(createWorkOrder(form)).rejects.toThrow("Invalid unit");
        expect(prisma.unit.findFirst).toHaveBeenCalledWith({
            where: { id: "unit1", propertyId: "prop1", organizationId: "org1", archived: false },
        });
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });
});

describe("sendWorkOrder", () => {
    it("logs the delivery method", async () => {
        await sendWorkOrder("wo1", "PRINT");

        expect(logEvent).toHaveBeenCalledWith({
            ...ids,
            type: "SENT",
            actor: office,
            detail: { deliveryMethod: "PRINT", resent: false },
        });
    });

    it("doesn't log when the work order isn't a draft", async () => {
        withWorkOrder({ status: "SENT" });

        await expect(sendWorkOrder("wo1", "PRINT")).rejects.toThrow();
        expect(logEvent).not.toHaveBeenCalled();
        expect(notifyTenant).not.toHaveBeenCalled();
    });

    it("emails the tenant and notes it in the log", async () => {
        vi.mocked(notifyTenant).mockReturnValueOnce(true);

        await sendWorkOrder("wo1", "PRINT");

        expect(notifyTenant).toHaveBeenCalledWith(
            expect.objectContaining({ name: "Acme Property" }),
            expect.objectContaining({ id: "wo1", address: "12 Oak St, Greenville, SC 29601", contractor }),
        );
        expect(logEvent).toHaveBeenCalledWith({
            ...ids,
            type: "SENT",
            actor: office,
            detail: { deliveryMethod: "PRINT", resent: false, tenantNotified: true },
        });
    });
});

describe("emailWorkOrder", () => {
    it.each([
        ["DRAFT", false],
        ["SENT", true],
    ])("logs an email on a %s work order with resent %s", async (status, resent) => {
        withWorkOrder({ status });

        expect(await emailWorkOrder("wo1")).toEqual({ ok: true, to: "joe@example.com" });
        expect(logEvent).toHaveBeenCalledWith({
            ...ids,
            type: "SENT",
            actor: office,
            detail: { deliveryMethod: "EMAIL", resent },
        });
    });

    it("doesn't log when the email fails", async () => {
        vi.mocked(sendEmail).mockRejectedValueOnce(new Error("Resend is down"));
        vi.spyOn(console, "error").mockImplementation(() => {});

        expect((await emailWorkOrder("wo1")).ok).toBe(false);
        expect(logEvent).not.toHaveBeenCalled();
    });

    it("emails the tenant on the first send and notes it in the log", async () => {
        vi.mocked(notifyTenant).mockReturnValueOnce(true);

        await emailWorkOrder("wo1");

        expect(notifyTenant).toHaveBeenCalledWith(
            expect.objectContaining({ name: "Acme Property" }),
            expect.objectContaining({ id: "wo1", address: "12 Oak St, Greenville, SC 29601", contractor }),
        );
        expect(logEvent).toHaveBeenCalledWith({
            ...ids,
            type: "SENT",
            actor: office,
            detail: { deliveryMethod: "EMAIL", resent: false, tenantNotified: true },
        });
    });

    it("doesn't email the tenant on a resend", async () => {
        withWorkOrder({ status: "SENT" });

        await emailWorkOrder("wo1");

        expect(notifyTenant).not.toHaveBeenCalled();
    });

    it("doesn't email the tenant when the contractor email fails", async () => {
        vi.mocked(sendEmail).mockRejectedValueOnce(new Error("Resend is down"));
        vi.spyOn(console, "error").mockImplementation(() => {});

        await emailWorkOrder("wo1");

        expect(notifyTenant).not.toHaveBeenCalled();
    });
});

describe("status changes", () => {
    it.each([
        ["markWorkOrderCompleted", markWorkOrderCompleted, "SENT", "COMPLETED_BY_OFFICE"],
        ["reopenWorkOrder", reopenWorkOrder, "COMPLETED", "REOPENED"],
        ["closeWorkOrder", closeWorkOrder, "COMPLETED", "CLOSED"],
    ])("%s logs %s", async (_name, action, status, type) => {
        withWorkOrder({ status });

        await action("wo1");

        expect(logEvent).toHaveBeenCalledWith({ ...ids, type, actor: office });
    });

    it("cancelWorkOrder logs a cancel with no reason", async () => {
        withWorkOrder({ status: "SENT" });

        await cancelWorkOrder("wo1");

        expect(logEvent).toHaveBeenCalledWith({ ...ids, type: "CANCELLED", actor: office, detail: { reason: null } });
    });

    it("cancelWorkOrder trims the reason, stores it and logs it", async () => {
        withWorkOrder({ status: "SENT" });

        await cancelWorkOrder("wo1", "  Tenant fixed it  ");

        expect(prisma.workOrder.update).toHaveBeenCalledWith({
            where: { id: "wo1" },
            data: { status: "CANCELLED", cancelledAt: expect.any(Date), cancelReason: "Tenant fixed it" },
        });
        expect(logEvent).toHaveBeenCalledWith({
            ...ids,
            type: "CANCELLED",
            actor: office,
            detail: { reason: "Tenant fixed it" },
        });
    });

    it("cancelWorkOrder refuses a reason over 500 characters", async () => {
        withWorkOrder({ status: "SENT" });

        await expect(cancelWorkOrder("wo1", "x".repeat(501))).rejects.toThrow();
        expect(prisma.workOrder.update).not.toHaveBeenCalled();
        expect(logEvent).not.toHaveBeenCalled();
    });

    it("doesn't log a refused change", async () => {
        withWorkOrder({ status: "SENT" });

        await expect(closeWorkOrder("wo1")).rejects.toThrow();
        expect(logEvent).not.toHaveBeenCalled();
    });

    it("doesn't log for a work order in another organization", async () => {
        vi.mocked(prisma.workOrder.findFirst).mockResolvedValue(null);

        await expect(markWorkOrderCompleted("wo1")).rejects.toThrow();
        expect(prisma.workOrder.findFirst).toHaveBeenCalledWith({ where: { id: "wo1", organizationId: "org1" } });
        expect(logEvent).not.toHaveBeenCalled();
    });
});

describe("archiveWorkOrder", () => {
    it("logs only the archive for a draft", async () => {
        await archiveWorkOrder("wo1");

        expect(vi.mocked(logEvent).mock.calls).toEqual([[{ ...ids, type: "ARCHIVED", actor: office }]]);
    });

    it("logs the cancel, then the archive, for a sent work order", async () => {
        withWorkOrder({ status: "SENT" });

        await archiveWorkOrder("wo1");

        expect(vi.mocked(logEvent).mock.calls).toEqual([
            [{ ...ids, type: "CANCELLED", actor: office, detail: { reason: "Archived" } }],
            [{ ...ids, type: "ARCHIVED", actor: office }],
        ]);
    });
});

describe("restoreWorkOrder", () => {
    it("logs the restore", async () => {
        withWorkOrder({ archived: true });

        expect(await restoreWorkOrder("wo1")).toEqual({ ok: true });
        expect(logEvent).toHaveBeenCalledWith({ ...ids, type: "RESTORED", actor: office });
    });

    it("doesn't log when the property is archived", async () => {
        withWorkOrder({ archived: true, property: { archived: true } });

        expect((await restoreWorkOrder("wo1")).ok).toBe(false);
        expect(logEvent).not.toHaveBeenCalled();
    });
});

describe("updateWorkOrder", () => {
    const ana = { id: "ana", displayName: "Ana's Electric", phone: null, email: null };

    function editForm(changes: Record<string, string> = {}) {
        const form = new FormData();
        const values = { title: "Fix sink", contractorId: "joes", ...changes };
        for (const [name, value] of Object.entries(values)) form.set(name, value);
        return form;
    }

    beforeEach(() => {
        withWorkOrder({ status: "SENT" });
        vi.mocked(prisma.contact.findFirst).mockResolvedValue(contractor as never);
    });

    it("logs the fields that changed on a sent work order", async () => {
        await updateWorkOrder("wo1", editForm({ title: "Fix kitchen sink", dueDate: "2026-11-10" }));

        expect(vi.mocked(logEvent).mock.calls).toEqual([
            [{ ...ids, type: "EDITED", actor: office, detail: { fields: ["title", "dueDate"] } }],
        ]);
    });

    it("logs nothing when nothing changed", async () => {
        await updateWorkOrder("wo1", editForm());

        expect(logEvent).not.toHaveBeenCalled();
    });

    it("logs a contractor change with both names", async () => {
        vi.mocked(prisma.contact.findFirst).mockResolvedValue(ana as never);

        await updateWorkOrder("wo1", editForm({ contractorId: "ana" }));

        expect(vi.mocked(logEvent).mock.calls).toEqual([
            [
                {
                    ...ids,
                    type: "CONTRACTOR_CHANGED",
                    actor: office,
                    detail: { from: "Joe's Plumbing", to: "Ana's Electric" },
                },
            ],
        ]);
    });

    it("doesn't log edits to a draft", async () => {
        withWorkOrder({ status: "DRAFT" });
        vi.mocked(prisma.contact.findFirst).mockResolvedValue(ana as never);

        await updateWorkOrder("wo1", editForm({ title: "Fix kitchen sink", contractorId: "ana" }));

        expect(logEvent).not.toHaveBeenCalled();
    });

    it("hands a sent work order to the office: drops the contractor and kills their link", async () => {
        await updateWorkOrder("wo1", editForm({ contractorId: IN_HOUSE }));

        const { data } = vi.mocked(prisma.workOrder.update).mock.calls[0][0];
        expect(data).toMatchObject({ inHouse: true, contractorId: null, contractorEmail: null, deliveryMethod: null });
        expect(data.publicToken).not.toBe("token1");
        expect(prisma.contact.findFirst).not.toHaveBeenCalled();
        expect(vi.mocked(logEvent).mock.calls).toEqual([
            [{ ...ids, type: "CONTRACTOR_CHANGED", actor: office, detail: { from: "Joe's Plumbing", to: "In-house" } }],
        ]);
    });
});

describe("in-house work orders", () => {
    const inHouse = {
        inHouse: true,
        contractorId: null,
        contractorName: null,
        contractorEmail: null,
        contractor: null,
    };

    it("can't be marked as sent", async () => {
        withWorkOrder(inHouse);

        await expect(sendWorkOrder("wo1", "PRINT")).rejects.toThrow("started, not sent");
        expect(prisma.workOrder.update).not.toHaveBeenCalled();
    });

    it("have no contractor link to regenerate", async () => {
        withWorkOrder(inHouse);

        await expect(regeneratePublicToken("wo1")).rejects.toThrow("no contractor link");
        expect(prisma.workOrder.update).not.toHaveBeenCalled();
    });

    it("start through the shared helper", async () => {
        vi.mocked(startInHouseWorkOrder).mockResolvedValue({ ok: true, jobNumber: "2026-1001", tenantNotified: false });

        expect(await startWorkOrder("wo1")).toEqual({ ok: true });
        expect(startInHouseWorkOrder).toHaveBeenCalledWith(
            expect.objectContaining({ organizationId: "org1", user, workOrderId: "wo1" }),
        );
    });

    it("reopen to In progress once started", async () => {
        withWorkOrder({ ...inHouse, status: "COMPLETED", startedAt: new Date("2026-11-07") });

        await reopenWorkOrder("wo1");

        expect(vi.mocked(prisma.workOrder.update).mock.calls[0][0].data).toMatchObject({ status: "IN_PROGRESS" });
    });

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

                await expect(setLineItemCompleted("li1", true)).rejects.toThrow();
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

describe("regeneratePublicToken", () => {
    it("logs the new link as an edit", async () => {
        await regeneratePublicToken("wo1");

        expect(logEvent).toHaveBeenCalledWith({ ...ids, type: "EDITED", actor: office, detail: { fields: ["link"] } });
    });
});

describe("line item photos", () => {
    const attachment = { findMany: vi.fn(), deleteMany: vi.fn(), create: vi.fn() };
    const detail = { item: "Replace faucet", area: "Kitchen" };

    beforeEach(() => {
        vi.mocked(prisma.lineItem.findFirst).mockResolvedValue({
            id: "li1",
            description: "Replace faucet",
            area: { name: "Kitchen", workOrder: { ...workOrder, status: "SENT" } },
        } as never);
        vi.mocked(prisma.$transaction).mockImplementation((async (fn: (tx: unknown) => unknown) =>
            fn({ attachment })) as never);
        attachment.findMany.mockResolvedValue([{ storageKey: "old-key" }]);
    });

    it("logs an added photo with its item and area", async () => {
        const form = new FormData();
        form.set("photo", new File([new Uint8Array([1, 2, 3])], "faucet.jpg"));

        expect(await setLineItemPhoto("li1", form)).toEqual({ ok: true });
        expect(logEvent).toHaveBeenCalledWith({ ...ids, type: "PHOTO_ADDED", actor: office, detail });
    });

    it("logs a removed photo", async () => {
        expect(await removeLineItemPhoto("li1")).toEqual({ ok: true });
        expect(logEvent).toHaveBeenCalledWith({ ...ids, type: "PHOTO_REMOVED", actor: office, detail });
    });

    it("doesn't log a remove when there was no photo", async () => {
        attachment.findMany.mockResolvedValue([]);

        await removeLineItemPhoto("li1");

        expect(logEvent).not.toHaveBeenCalled();
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
        await expect(renameArea("area1", "   ")).rejects.toThrow("Enter an area name");
        await expect(renameArea("area1", "x".repeat(101))).rejects.toThrow("Use 100 characters or fewer");

        vi.mocked(prisma.area.findFirst).mockResolvedValue({
            ...kitchen("SENT"),
            workOrder: { ...workOrder, organizationId: "org2" },
        } as never);
        await expect(renameArea("area1", "Pantry")).rejects.toThrow("Invalid area");
        expect(prisma.area.update).not.toHaveBeenCalled();
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
            await expect(attempt()).rejects.toThrow("This work order can't be edited");
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
