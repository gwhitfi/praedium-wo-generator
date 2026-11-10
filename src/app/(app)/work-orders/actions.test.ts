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
        attachment: { count: vi.fn(), findFirst: vi.fn(), deleteMany: vi.fn() },
        $transaction: vi.fn(),
    },
}));
vi.mock("@/lib/email", () => ({ getAppUrl: vi.fn(() => "https://example.com") }));
vi.mock("@/lib/emailLog", () => ({ sendLoggedEmail: vi.fn() }));
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
    MAX_LINE_ITEM_PHOTOS: 3,
}));

import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { sendLoggedEmail as sendEmail } from "@/lib/emailLog";
import { deleteFiles, lineItemPhotoKey, uploadFile } from "@/lib/storage";
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
    addLineItemPhoto,
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
    vi.mocked(prisma.lineItem.count).mockResolvedValue(2);
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

        await createWorkOrder({}, form);

        expect(logEvent).toHaveBeenCalledWith({ ...ids, type: "CREATED", actor: office, detail: { source: "form" } });
        expect(redirect).toHaveBeenCalledWith("/work-orders/wo1?flash=work-order-created");
    });

    it("creates the first area and line item when they're filled in (a one-line job)", async () => {
        const create = vi.fn().mockResolvedValue({ id: "wo1" });
        vi.mocked(prisma.property.findFirst).mockResolvedValue({ id: "prop1" } as never);
        vi.mocked(prisma.$transaction).mockImplementation((async (fn: (tx: unknown) => unknown) =>
            fn({ workOrder: { create } })) as never);
        const form = new FormData();
        form.set("propertyId", "prop1");
        form.set("title", "Fix sink");
        form.set("firstArea", "");
        form.set("firstItem", " Replace the faucet cartridge ");
        form.set("firstPriority", "HIGH");

        await createWorkOrder({}, form);

        expect(create.mock.calls[0][0].data.areas).toEqual({
            create: {
                name: "General",
                sortOrder: 0,
                lineItems: { create: { description: "Replace the faucet cartridge", priority: "HIGH", sortOrder: 0 } },
            },
        });
    });

    it("creates no area when the first item is left empty", async () => {
        const create = vi.fn().mockResolvedValue({ id: "wo1" });
        vi.mocked(prisma.property.findFirst).mockResolvedValue({ id: "prop1" } as never);
        vi.mocked(prisma.$transaction).mockImplementation((async (fn: (tx: unknown) => unknown) =>
            fn({ workOrder: { create } })) as never);
        const form = new FormData();
        form.set("propertyId", "prop1");
        form.set("title", "Fix sink");
        form.set("firstItem", "  ");

        await createWorkOrder({}, form);

        expect(create.mock.calls[0][0].data.areas).toBeUndefined();
    });

    it("refuses an archived unit with a field error and keeps what was typed", async () => {
        vi.mocked(prisma.property.findFirst).mockResolvedValue({ id: "prop1" } as never);
        vi.mocked(prisma.unit.findFirst).mockResolvedValue(null);
        const form = new FormData();
        form.set("propertyId", "prop1");
        form.set("unitId", "unit1");
        form.set("title", "Fix sink");

        await expect(createWorkOrder({}, form)).resolves.toEqual({
            errors: { unitId: ["Choose a unit at this property"] },
            values: { propertyId: "prop1", unitId: "unit1", title: "Fix sink" },
        });
        expect(prisma.unit.findFirst).toHaveBeenCalledWith({
            where: { id: "unit1", propertyId: "prop1", organizationId: "org1", archived: false },
        });
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("reports a missing title and property together", async () => {
        vi.mocked(prisma.property.findFirst).mockResolvedValue(null);
        const form = new FormData();
        form.set("title", "  ");

        const state = await createWorkOrder({}, form);

        expect(state.errors).toEqual({ title: ["Enter a title"], propertyId: ["Choose a property"] });
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("refuses a contractor from another organization", async () => {
        vi.mocked(prisma.property.findFirst).mockResolvedValue({ id: "prop1" } as never);
        vi.mocked(prisma.contact.findFirst).mockResolvedValue(null);
        const form = new FormData();
        form.set("propertyId", "prop1");
        form.set("title", "Fix sink");
        form.set("contractorId", "someone-else");

        const state = await createWorkOrder({}, form);

        expect(state.errors).toEqual({ contractorId: ["That contractor is no longer available"] });
        expect(prisma.contact.findFirst).toHaveBeenCalledWith({
            where: {
                id: "someone-else",
                organizationId: "org1",
                archived: false,
                contactType: { in: ["CONTRACTOR", "OTHER"] },
            },
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

    it("refuses a draft with no line items", async () => {
        vi.mocked(prisma.lineItem.count).mockResolvedValue(0);

        expect(await sendWorkOrder("wo1", "PRINT")).toEqual({
            ok: false,
            error: "Add at least one line item before sending",
        });
        expect(prisma.workOrder.update).not.toHaveBeenCalled();
        expect(logEvent).not.toHaveBeenCalled();
    });

    it("doesn't log when the work order isn't a draft", async () => {
        withWorkOrder({ status: "SENT" });

        expect(await sendWorkOrder("wo1", "PRINT")).toMatchObject({ ok: false });
        expect(logEvent).not.toHaveBeenCalled();
        expect(notifyTenant).not.toHaveBeenCalled();
    });

    it("refuses a delivery method that doesn't exist, before looking anything up", async () => {
        expect(await sendWorkOrder("wo1", "FAX" as never)).toEqual({ ok: false, error: "Choose how it was sent" });
        expect(prisma.workOrder.findFirst).not.toHaveBeenCalled();
        expect(prisma.workOrder.update).not.toHaveBeenCalled();
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

    describe("a draft that was cancelled and reopened", () => {
        const reopened = { status: "DRAFT", sentAt: new Date("2026-11-03") };

        it("doesn't email the tenant again when the box is unticked", async () => {
            withWorkOrder(reopened);

            expect(await sendWorkOrder("wo1", "PRINT", false)).toEqual({ ok: true });
            expect(notifyTenant).not.toHaveBeenCalled();
        });

        it("emails the tenant again when the box is ticked", async () => {
            withWorkOrder(reopened);
            vi.mocked(notifyTenant).mockReturnValueOnce(true);

            await sendWorkOrder("wo1", "PRINT", true);

            expect(notifyTenant).toHaveBeenCalledTimes(1);
        });

        it("emails the tenant again through the email button when asked", async () => {
            withWorkOrder({ ...reopened, deliveryMethod: "EMAIL" });
            vi.mocked(notifyTenant).mockReturnValueOnce(true);

            expect(await emailWorkOrder("wo1", true)).toEqual({ ok: true, to: "joe@example.com" });
            expect(notifyTenant).toHaveBeenCalledTimes(1);
        });

        it("refuses a choice that isn't true or false", async () => {
            withWorkOrder(reopened);

            expect(await sendWorkOrder("wo1", "PRINT", "yes" as never)).toMatchObject({ ok: false });
            expect(await emailWorkOrder("wo1", "yes" as never)).toMatchObject({ ok: false });
            expect(await startWorkOrder("wo1", "yes" as never)).toMatchObject({ ok: false });
            expect(prisma.workOrder.update).not.toHaveBeenCalled();
            expect(startInHouseWorkOrder).not.toHaveBeenCalled();
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

        expect(await cancelWorkOrder("wo1", "x".repeat(501))).toEqual({
            ok: false,
            error: "Use 500 characters or fewer",
        });
        expect(prisma.workOrder.update).not.toHaveBeenCalled();
        expect(logEvent).not.toHaveBeenCalled();
    });

    it("doesn't log a refused change", async () => {
        withWorkOrder({ status: "SENT" });

        expect(await closeWorkOrder("wo1")).toEqual({ ok: false, error: "Only completed work orders can be closed" });
        expect(logEvent).not.toHaveBeenCalled();
    });

    describe("markWorkOrderCompleted", () => {
        it.each(["SENT", "IN_PROGRESS"])("completes a %s work order", async (status) => {
            withWorkOrder({ status });

            expect(await markWorkOrderCompleted("wo1")).toEqual({ ok: true });
            expect(prisma.workOrder.update).toHaveBeenCalledWith({
                where: { id: "wo1" },
                data: { status: "COMPLETED", completedAt: expect.any(Date) },
            });
        });

        const notOut = "Only sent or in-progress work orders can be marked as completed.";

        it.each([
            ["a draft", { status: "DRAFT" }, notOut],
            ["a completed one", { status: "COMPLETED" }, notOut],
            ["a closed one", { status: "CLOSED" }, notOut],
            ["a cancelled one", { status: "CANCELLED" }, notOut],
            ["an archived one", { status: "SENT", archived: true }, "Restore this work order before changing it."],
        ])("refuses %s", async (_name, changes, error) => {
            withWorkOrder(changes);

            expect(await markWorkOrderCompleted("wo1")).toEqual({ ok: false, error });
            expect(prisma.workOrder.update).not.toHaveBeenCalled();
            expect(logEvent).not.toHaveBeenCalled();
        });
    });

    describe("reopenWorkOrder", () => {
        const sentAt = new Date("2026-11-01");

        function reopenedTo() {
            return vi.mocked(prisma.workOrder.update).mock.calls[0][0].data;
        }

        it("takes a completed work order back to Sent when nothing was checked off", async () => {
            withWorkOrder({ status: "COMPLETED", sentAt });
            vi.mocked(prisma.lineItem.count).mockResolvedValue(0);

            expect(await reopenWorkOrder("wo1")).toEqual({ ok: true, status: "SENT" });
            expect(prisma.lineItem.count).toHaveBeenCalledWith({
                where: { area: { workOrderId: "wo1" }, completed: true },
            });
            expect(reopenedTo()).toEqual({
                status: "SENT",
                closedAt: null,
                completedAt: null,
                cancelledAt: null,
                cancelReason: null,
            });
        });

        it("takes a completed work order back to In progress when items were checked off", async () => {
            withWorkOrder({ status: "COMPLETED", sentAt });
            vi.mocked(prisma.lineItem.count).mockResolvedValue(1);

            expect(await reopenWorkOrder("wo1")).toEqual({ ok: true, status: "IN_PROGRESS" });
        });

        it("takes a closed work order back to Completed, keeping its completion date", async () => {
            withWorkOrder({ status: "CLOSED", sentAt });

            expect(await reopenWorkOrder("wo1")).toEqual({ ok: true, status: "COMPLETED" });
            expect(reopenedTo()).toEqual({ status: "COMPLETED", closedAt: null });
            expect(prisma.lineItem.count).not.toHaveBeenCalled();
        });

        it("takes a cancelled work order back to Draft and clears the cancel reason", async () => {
            withWorkOrder({ status: "CANCELLED", sentAt, cancelReason: "Tenant fixed it" });

            expect(await reopenWorkOrder("wo1")).toEqual({ ok: true, status: "DRAFT" });
            expect(reopenedTo()).toMatchObject({ status: "DRAFT", cancelledAt: null, cancelReason: null });
            expect(logEvent).toHaveBeenCalledWith({ ...ids, type: "REOPENED", actor: office });
        });

        const notFinished = "Only completed, closed or cancelled work orders can be reopened.";

        it.each([
            ["a draft", { status: "DRAFT" }, notFinished],
            ["a sent one", { status: "SENT", sentAt }, notFinished],
            ["an in-progress one", { status: "IN_PROGRESS", sentAt }, notFinished],
            [
                "an archived one",
                { status: "CANCELLED", archived: true },
                "Restore this work order before reopening it.",
            ],
        ])("refuses %s", async (_name, changes, error) => {
            withWorkOrder(changes);

            expect(await reopenWorkOrder("wo1")).toEqual({ ok: false, error });
            expect(prisma.workOrder.update).not.toHaveBeenCalled();
            expect(logEvent).not.toHaveBeenCalled();
        });
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
        await updateWorkOrder("wo1", {}, editForm({ title: "Fix kitchen sink", dueDate: "2026-11-10" }));

        expect(vi.mocked(logEvent).mock.calls).toEqual([
            [{ ...ids, type: "EDITED", actor: office, detail: { fields: ["title", "dueDate"] } }],
        ]);
    });

    it("logs nothing when nothing changed", async () => {
        await updateWorkOrder("wo1", {}, editForm());

        expect(logEvent).not.toHaveBeenCalled();
    });

    it("logs a contractor change with both names", async () => {
        vi.mocked(prisma.contact.findFirst).mockResolvedValue(ana as never);

        await updateWorkOrder("wo1", {}, editForm({ contractorId: "ana" }));

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

        await updateWorkOrder("wo1", {}, editForm({ title: "Fix kitchen sink", contractorId: "ana" }));

        expect(logEvent).not.toHaveBeenCalled();
    });

    it("explains why a closed work order can't be edited instead of throwing", async () => {
        withWorkOrder({ status: "CLOSED" });

        const state = await updateWorkOrder("wo1", {}, editForm({ title: "Fix kitchen sink" }));

        expect(state.error).toMatch(/no longer open/);
        expect(state.values).toMatchObject({ title: "Fix kitchen sink" });
        expect(prisma.workOrder.update).not.toHaveBeenCalled();
    });

    it("hands a sent work order to the office: drops the contractor and kills their link", async () => {
        await updateWorkOrder("wo1", {}, editForm({ contractorId: IN_HOUSE }));

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

        expect(await sendWorkOrder("wo1", "PRINT")).toEqual({
            ok: false,
            error: "In-house work orders are started, not sent",
        });
        expect(prisma.workOrder.update).not.toHaveBeenCalled();
    });

    it("have no contractor link to regenerate", async () => {
        withWorkOrder(inHouse);

        expect(await regeneratePublicToken("wo1")).toEqual({
            ok: false,
            error: "In-house work orders have no contractor link",
        });
        expect(prisma.workOrder.update).not.toHaveBeenCalled();
    });

    it("start through the shared helper", async () => {
        vi.mocked(startInHouseWorkOrder).mockResolvedValue({ ok: true, jobNumber: "2026-1001", tenantNotified: false });

        expect(await startWorkOrder("wo1")).toEqual({ ok: true });
        expect(startInHouseWorkOrder).toHaveBeenCalledWith(
            expect.objectContaining({ organizationId: "org1", user, workOrderId: "wo1", notifyTenantAgain: false }),
        );

        await startWorkOrder("wo1", true);
        expect(startInHouseWorkOrder).toHaveBeenLastCalledWith(expect.objectContaining({ notifyTenantAgain: true }));
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

describe("regeneratePublicToken", () => {
    it("logs the new link as an edit", async () => {
        expect(await regeneratePublicToken("wo1")).toEqual({ ok: true });

        expect(logEvent).toHaveBeenCalledWith({ ...ids, type: "EDITED", actor: office, detail: { fields: ["link"] } });
    });

    it.each([
        { status: "COMPLETED" },
        { status: "CLOSED" },
        { status: "CANCELLED" },
        { status: "SENT", archived: true },
    ])("refuses a work order that isn't open (%o)", async (changes) => {
        withWorkOrder(changes);

        expect(await regeneratePublicToken("wo1")).toEqual({
            ok: false,
            error: "Only open work orders can get a new link.",
        });
        expect(prisma.workOrder.update).not.toHaveBeenCalled();
        expect(logEvent).not.toHaveBeenCalled();
    });
});

describe("line item photos", () => {
    const tx = { attachment: { count: vi.fn(), create: vi.fn() }, $queryRaw: vi.fn() };
    const detail = { item: "Replace faucet", area: "Kitchen" };
    const faucet = (status: string, archived = false) => ({
        id: "li1",
        description: "Replace faucet",
        area: { name: "Kitchen", workOrder: { ...workOrder, status, archived } },
    });
    const photoForm = () => {
        const form = new FormData();
        form.set("photo", new File([new Uint8Array([1, 2, 3])], "faucet.jpg"));
        return form;
    };

    beforeEach(() => {
        vi.mocked(prisma.lineItem.findFirst).mockResolvedValue(faucet("SENT") as never);
        vi.mocked(prisma.$transaction).mockImplementation((async (fn: (tx: unknown) => unknown) => fn(tx)) as never);
        vi.mocked(lineItemPhotoKey).mockReturnValue("new-key");
        vi.mocked(prisma.attachment.count).mockResolvedValue(1);
        tx.attachment.count.mockResolvedValue(1);
        vi.mocked(prisma.attachment.findFirst).mockResolvedValue({
            id: "ph1",
            lineItemId: "li1",
            storageKey: "old-key",
        } as never);
        vi.mocked(prisma.attachment.deleteMany).mockResolvedValue({ count: 1 });
    });

    describe("addLineItemPhoto", () => {
        it("adds the photo next to the existing ones and logs it with its item and area", async () => {
            expect(await addLineItemPhoto("li1", photoForm())).toEqual({ ok: true });

            expect(tx.$queryRaw).toHaveBeenCalled();
            expect(tx.attachment.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    lineItemId: "li1",
                    organizationId: "org1",
                    storageKey: "new-key",
                    sortOrder: 1,
                }),
            });
            expect(deleteFiles).not.toHaveBeenCalled();
            expect(logEvent).toHaveBeenCalledWith({ ...ids, type: "PHOTO_ADDED", actor: office, detail });
        });

        it("refuses a 4th photo before uploading", async () => {
            vi.mocked(prisma.attachment.count).mockResolvedValue(3);

            expect(await addLineItemPhoto("li1", photoForm())).toEqual({
                ok: false,
                error: "A line item can have up to 3 photos.",
            });
            expect(uploadFile).not.toHaveBeenCalled();
            expect(logEvent).not.toHaveBeenCalled();
        });

        it("deletes the uploaded file when the item filled up during the upload", async () => {
            tx.attachment.count.mockResolvedValue(3);

            expect(await addLineItemPhoto("li1", photoForm())).toEqual({
                ok: false,
                error: "A line item can have up to 3 photos.",
            });
            expect(tx.attachment.create).not.toHaveBeenCalled();
            expect(deleteFiles).toHaveBeenCalledWith(["new-key"]);
            expect(logEvent).not.toHaveBeenCalled();
        });

        it("refuses a closed work order", async () => {
            vi.mocked(prisma.lineItem.findFirst).mockResolvedValue(faucet("COMPLETED") as never);

            expect(await addLineItemPhoto("li1", photoForm())).toEqual({
                ok: false,
                error: "Photos can only be changed on open work orders.",
            });
            expect(uploadFile).not.toHaveBeenCalled();
        });
    });

    describe("removeLineItemPhoto", () => {
        it("removes only that photo and its file, and logs it", async () => {
            expect(await removeLineItemPhoto("ph1")).toEqual({ ok: true });

            expect(prisma.attachment.findFirst).toHaveBeenCalledWith(
                expect.objectContaining({ where: { id: "ph1", organizationId: "org1", lineItemId: { not: null } } }),
            );
            expect(prisma.attachment.deleteMany).toHaveBeenCalledWith({ where: { id: "ph1", organizationId: "org1" } });
            expect(deleteFiles).toHaveBeenCalledWith(["old-key"]);
            expect(logEvent).toHaveBeenCalledWith({ ...ids, type: "PHOTO_REMOVED", actor: office, detail });
        });

        it("refuses another organization's photo", async () => {
            vi.mocked(prisma.attachment.findFirst).mockResolvedValue(null);

            expect(await removeLineItemPhoto("ph1")).toEqual({ ok: false, error: "Photo not found." });
            expect(prisma.attachment.deleteMany).not.toHaveBeenCalled();
            expect(deleteFiles).not.toHaveBeenCalled();
        });

        it.each([
            ["closed", faucet("CLOSED")],
            ["archived", faucet("SENT", true)],
        ])("refuses a photo on a %s work order", async (_, lineItem) => {
            vi.mocked(prisma.lineItem.findFirst).mockResolvedValue(lineItem as never);

            expect(await removeLineItemPhoto("ph1")).toEqual({
                ok: false,
                error: "Photos can only be changed on open work orders.",
            });
            expect(prisma.attachment.deleteMany).not.toHaveBeenCalled();
            expect(deleteFiles).not.toHaveBeenCalled();
        });

        it("doesn't log or delete files when the photo was already gone", async () => {
            vi.mocked(prisma.attachment.deleteMany).mockResolvedValue({ count: 0 });

            expect(await removeLineItemPhoto("ph1")).toEqual({ ok: true });
            expect(deleteFiles).not.toHaveBeenCalled();
            expect(logEvent).not.toHaveBeenCalled();
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
