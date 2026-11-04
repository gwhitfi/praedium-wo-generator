import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
    default: {
        workOrder: { findFirst: vi.fn(), update: vi.fn() },
    },
}));
vi.mock("@/lib/workOrderEvents", () => ({ logEvent: vi.fn() }));
vi.mock("@/lib/emails/notifyCancelled", () => ({ notifyContractorsCancelled: vi.fn() }));
vi.mock("@/lib/workOrderSend", () => ({ emailWorkOrderToContractor: vi.fn() }));

import { notifyContractorsCancelled } from "@/lib/emails/notifyCancelled";
import prisma from "@/lib/prisma";
import { logEvent } from "@/lib/workOrderEvents";
import { emailWorkOrderToContractor } from "@/lib/workOrderSend";
import { archiveWorkOrder, cancelInput, cancelWorkOrder, restoreWorkOrder, sendWorkOrder } from "./status";

const organization = { id: "org1", name: "Acme Property", phone: null, email: "office@acme.test" };
const user = { id: "user1", firstName: "Justin", lastName: "W", email: "j@example.com" };
const actor = { kind: "office", user } as const;
const ids = { workOrderId: "wo1", organizationId: "org1", actor };

function workOrder(overrides: Record<string, unknown> = {}) {
    return {
        id: "wo1",
        organizationId: "org1",
        jobNumber: "2026-1001",
        status: "SENT",
        archived: false,
        title: "Fix leak",
        contractorEmail: "joe@example.com",
        property: { addressLine1: "12 Oak St", city: "Greenville", state: "SC", zipCode: "29601", archived: false },
        unit: null,
        ...overrides,
    };
}

function withWorkOrder(overrides: Record<string, unknown> = {}) {
    vi.mocked(prisma.workOrder.findFirst).mockResolvedValue(workOrder(overrides) as never);
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.workOrder.update).mockResolvedValue({} as never);
});

describe("sendWorkOrder", () => {
    it("emails the work order through the shared helper as the key's creator", async () => {
        vi.mocked(emailWorkOrderToContractor).mockResolvedValue({
            ok: true,
            to: "joe@example.com",
            jobNumber: "2026-1001",
            resent: false,
            tenantNotified: true,
        });

        await expect(sendWorkOrder(organization, user, { id: "wo1" })).resolves.toEqual({
            ok: true,
            workOrder: {
                id: "wo1",
                jobNumber: "2026-1001",
                status: "SENT",
                sentTo: "joe@example.com",
                resent: false,
                tenantNotified: true,
            },
        });
        expect(emailWorkOrderToContractor).toHaveBeenCalledWith({
            organizationId: "org1",
            organization,
            user,
            workOrderId: "wo1",
        });
    });

    it("passes on the helper's error", async () => {
        vi.mocked(emailWorkOrderToContractor).mockResolvedValue({
            ok: false,
            error: "Joe's Plumbing has no email address",
        });
        await expect(sendWorkOrder(organization, user, { id: "wo1" })).resolves.toEqual({
            ok: false,
            error: "Joe's Plumbing has no email address",
        });
    });
});

describe("cancelWorkOrder", () => {
    it("cancels a sent work order with the reason, logs it and emails the contractor", async () => {
        withWorkOrder();

        await expect(cancelWorkOrder(organization, user, { id: "wo1", reason: "Tenant fixed it" })).resolves.toEqual({
            ok: true,
            workOrder: { id: "wo1", jobNumber: "2026-1001", status: "CANCELLED" },
        });
        expect(vi.mocked(prisma.workOrder.findFirst).mock.calls[0][0]).toMatchObject({
            where: { id: "wo1", organizationId: "org1" },
        });
        expect(prisma.workOrder.update).toHaveBeenCalledWith({
            where: { id: "wo1" },
            data: { status: "CANCELLED", cancelledAt: expect.any(Date), cancelReason: "Tenant fixed it" },
        });
        expect(logEvent).toHaveBeenCalledWith({ ...ids, type: "CANCELLED", detail: { reason: "Tenant fixed it" } });
        expect(notifyContractorsCancelled).toHaveBeenCalledWith(organization, [
            expect.objectContaining({ id: "wo1", address: "12 Oak St, Greenville, SC 29601" }),
        ]);
    });

    it("cancels without a reason and doesn't email for an archived work order", async () => {
        withWorkOrder({ status: "IN_PROGRESS", archived: true });

        await cancelWorkOrder(organization, user, cancelInput.parse({ id: "wo1" }));

        expect(logEvent).toHaveBeenCalledWith({ ...ids, type: "CANCELLED", detail: { reason: null } });
        expect(notifyContractorsCancelled).not.toHaveBeenCalled();
    });

    it.each(["DRAFT", "COMPLETED", "CLOSED", "CANCELLED"])("refuses a %s work order", async (status) => {
        withWorkOrder({ status });

        await expect(cancelWorkOrder(organization, user, { id: "wo1" })).resolves.toEqual({
            ok: false,
            error: "Only sent or in-progress work orders can be cancelled. Archive a draft instead.",
        });
        expect(prisma.workOrder.update).not.toHaveBeenCalled();
        expect(logEvent).not.toHaveBeenCalled();
    });

    it("refuses a work order outside the organization", async () => {
        vi.mocked(prisma.workOrder.findFirst).mockResolvedValue(null);
        await expect(cancelWorkOrder(organization, user, { id: "other" })).resolves.toEqual({
            ok: false,
            error: "No work order with that id was found.",
        });
    });

    it("limits the reason to 500 characters", () => {
        expect(cancelInput.safeParse({ id: "wo1", reason: "x".repeat(501) }).success).toBe(false);
        expect(cancelInput.safeParse({ id: "wo1", reason: "   " }).success).toBe(false);
    });
});

describe("archiveWorkOrder", () => {
    it("archives a draft with only an ARCHIVED event and no email", async () => {
        withWorkOrder({ status: "DRAFT" });

        await expect(archiveWorkOrder(organization, user, { id: "wo1" })).resolves.toEqual({
            ok: true,
            workOrder: { id: "wo1", jobNumber: "2026-1001", status: "DRAFT", archived: true },
        });
        expect(prisma.workOrder.update).toHaveBeenCalledWith({ where: { id: "wo1" }, data: { archived: true } });
        expect(vi.mocked(logEvent).mock.calls).toEqual([[{ ...ids, type: "ARCHIVED" }]]);
        expect(notifyContractorsCancelled).not.toHaveBeenCalled();
    });

    it("cancels a sent work order too, logs both events and emails the contractor", async () => {
        withWorkOrder();

        await expect(archiveWorkOrder(organization, user, { id: "wo1" })).resolves.toMatchObject({
            ok: true,
            workOrder: { status: "CANCELLED", archived: true },
        });
        expect(prisma.workOrder.update).toHaveBeenCalledWith({
            where: { id: "wo1" },
            data: { archived: true, status: "CANCELLED", cancelledAt: expect.any(Date) },
        });
        expect(vi.mocked(logEvent).mock.calls).toEqual([
            [{ ...ids, type: "CANCELLED", detail: { reason: "Archived" } }],
            [{ ...ids, type: "ARCHIVED" }],
        ]);
        expect(notifyContractorsCancelled).toHaveBeenCalledTimes(1);
    });

    it("refuses a work order that's already archived", async () => {
        withWorkOrder({ archived: true });
        await expect(archiveWorkOrder(organization, user, { id: "wo1" })).resolves.toEqual({
            ok: false,
            error: "This work order is already archived.",
        });
        expect(prisma.workOrder.update).not.toHaveBeenCalled();
    });
});

describe("restoreWorkOrder", () => {
    it("restores an archived work order without changing its status", async () => {
        withWorkOrder({ archived: true, status: "CANCELLED" });

        await expect(restoreWorkOrder(organization, user, { id: "wo1" })).resolves.toEqual({
            ok: true,
            workOrder: { id: "wo1", jobNumber: "2026-1001", status: "CANCELLED", archived: false },
        });
        expect(vi.mocked(prisma.workOrder.findFirst).mock.calls[0][0]).toMatchObject({
            where: { id: "wo1", organizationId: "org1" },
        });
        expect(prisma.workOrder.update).toHaveBeenCalledWith({ where: { id: "wo1" }, data: { archived: false } });
        expect(logEvent).toHaveBeenCalledWith({ ...ids, type: "RESTORED" });
    });

    it("refuses a work order that isn't archived, or whose property is archived", async () => {
        withWorkOrder();
        await expect(restoreWorkOrder(organization, user, { id: "wo1" })).resolves.toEqual({
            ok: false,
            error: "This work order isn't archived.",
        });

        withWorkOrder({ archived: true, property: { archived: true } });
        await expect(restoreWorkOrder(organization, user, { id: "wo1" })).resolves.toEqual({
            ok: false,
            error: "This work order's property is archived. Restore the property first.",
        });
        expect(prisma.workOrder.update).not.toHaveBeenCalled();
        expect(logEvent).not.toHaveBeenCalled();
    });
});
