import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
    default: { workOrder: { findFirst: vi.fn(), updateMany: vi.fn() } },
}));
vi.mock("@/lib/emails/notifyTenant", () => ({ notifyTenant: vi.fn(() => false) }));
vi.mock("@/lib/workOrderEvents", () => ({ logEvent: vi.fn() }));

import { notifyTenant } from "@/lib/emails/notifyTenant";
import prisma from "@/lib/prisma";
import { logEvent } from "@/lib/workOrderEvents";
import { startInHouseWorkOrder } from "./workOrderStart";

const organization = { name: "Acme Property", phone: null, email: "office@acme.test" };
const user = { id: "user1", firstName: "Justin", lastName: "W", email: "j@example.com" };
const start = { organizationId: "org1", organization, user, workOrderId: "wo1" };

function withWorkOrder(overrides: Record<string, unknown> = {}) {
    vi.mocked(prisma.workOrder.findFirst).mockResolvedValue({
        id: "wo1",
        organizationId: "org1",
        jobNumber: "2026-1001",
        status: "DRAFT",
        archived: false,
        inHouse: true,
        title: "Fix sink",
        notifyTenant: true,
        tenantEmail: "ana@example.com",
        property: { addressLine1: "12 Oak St", city: "Greenville", state: "SC", zipCode: "29601" },
        unit: null,
        ...overrides,
    } as never);
}

beforeEach(() => {
    vi.clearAllMocks();
    withWorkOrder();
    vi.mocked(prisma.workOrder.updateMany).mockResolvedValue({ count: 1 } as never);
});

describe("startInHouseWorkOrder", () => {
    it("moves an in-house draft to In progress, only while it's still one, scoped to the organization", async () => {
        const result = await startInHouseWorkOrder(start);

        expect(result).toEqual({ ok: true, jobNumber: "2026-1001", tenantNotified: false });
        expect(prisma.workOrder.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: "wo1", organizationId: "org1" } }),
        );
        expect(prisma.workOrder.updateMany).toHaveBeenCalledWith({
            where: { id: "wo1", organizationId: "org1", status: "DRAFT", inHouse: true, archived: false },
            data: { status: "IN_PROGRESS", startedAt: expect.any(Date) },
        });
        expect(logEvent).toHaveBeenCalledWith({
            type: "STARTED",
            workOrderId: "wo1",
            organizationId: "org1",
            actor: { kind: "office", user },
            detail: {},
        });
    });

    it("tells the tenant with no contractor named, and logs that it did", async () => {
        vi.mocked(notifyTenant).mockReturnValue(true);

        const result = await startInHouseWorkOrder(start);

        expect(result).toMatchObject({ ok: true, tenantNotified: true });
        expect(notifyTenant).toHaveBeenCalledWith(
            organization,
            expect.objectContaining({ contractor: null, address: "12 Oak St, Greenville, SC 29601" }),
        );
        expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({ detail: { tenantNotified: true } }));
    });

    it.each([
        [{ inHouse: false }, "Only in-house work orders can be started"],
        [{ status: "SENT" }, "Only draft work orders can be started"],
        [{ archived: true }, "Archived work orders can't be started"],
    ])("refuses %o", async (overrides, error) => {
        withWorkOrder(overrides);

        const result = await startInHouseWorkOrder(start);

        expect(result).toMatchObject({ ok: false, error: expect.stringContaining(error) });
        expect(prisma.workOrder.updateMany).not.toHaveBeenCalled();
        expect(logEvent).not.toHaveBeenCalled();
    });

    it("refuses another organization's work order", async () => {
        vi.mocked(prisma.workOrder.findFirst).mockResolvedValue(null);

        expect(await startInHouseWorkOrder(start)).toEqual({ ok: false, error: "Work order not found" });
    });

    it("doesn't email or log twice when another click started it first", async () => {
        vi.mocked(prisma.workOrder.updateMany).mockResolvedValue({ count: 0 } as never);

        const result = await startInHouseWorkOrder(start);

        expect(result.ok).toBe(false);
        expect(notifyTenant).not.toHaveBeenCalled();
        expect(logEvent).not.toHaveBeenCalled();
    });
});
