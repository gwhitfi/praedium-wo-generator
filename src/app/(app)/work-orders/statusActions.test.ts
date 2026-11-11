import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
    default: {
        workOrder: { findFirst: vi.fn(), update: vi.fn() },
        lineItem: { count: vi.fn() },
    },
}));
vi.mock("@/lib/email", () => ({ getAppUrl: vi.fn(() => "https://example.com") }));
vi.mock("@/lib/emailLog", () => ({ sendLoggedEmail: vi.fn() }));
vi.mock("@/lib/emails/workOrderEmail", () => ({ workOrderEmail: vi.fn(() => ({ subject: "", html: "", text: "" })) }));
vi.mock("@/lib/emails/notifyCancelled", () => ({ notifyContractorsCancelled: vi.fn() }));
vi.mock("@/lib/emails/notifyTenant", () => ({ notifyTenant: vi.fn(() => false) }));
vi.mock("@/lib/workOrderEvents", () => ({ logEvent: vi.fn() }));
vi.mock("@/lib/workOrderStart", () => ({ startInHouseWorkOrder: vi.fn() }));

import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { sendLoggedEmail as sendEmail } from "@/lib/emailLog";
import { logEvent } from "@/lib/workOrderEvents";
import { notifyTenant } from "@/lib/emails/notifyTenant";
import { startInHouseWorkOrder } from "@/lib/workOrderStart";
import {
    cancelWorkOrder,
    closeWorkOrder,
    emailWorkOrder,
    markWorkOrderCompleted,
    regeneratePublicToken,
    reopenWorkOrder,
    sendWorkOrder,
    startWorkOrder,
} from "./statusActions";

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

    it("counts line items in the organization's work order only", async () => {
        await sendWorkOrder("wo1", "PRINT");

        expect(prisma.lineItem.count).toHaveBeenCalledWith({
            where: { area: { workOrderId: "wo1", workOrder: { organizationId: "org1" } } },
        });
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
                where: { area: { workOrderId: "wo1", workOrder: { organizationId: "org1" } }, completed: true },
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
