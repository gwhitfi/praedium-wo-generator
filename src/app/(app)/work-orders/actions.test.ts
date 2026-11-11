import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
    default: {
        property: { findFirst: vi.fn() },
        unit: { findFirst: vi.fn() },
        contact: { findFirst: vi.fn() },
        workOrder: { findFirst: vi.fn(), update: vi.fn() },
        $transaction: vi.fn(),
    },
}));
vi.mock("@/lib/emails/notifyCancelled", () => ({ notifyContractorsCancelled: vi.fn() }));
vi.mock("@/lib/storage", () => ({ deleteFiles: vi.fn() }));
vi.mock("@/lib/attachments", () => ({ attachmentKeys: vi.fn(), onWorkOrders: vi.fn() }));
vi.mock("@/lib/workOrderCreate", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/workOrderCreate")>()),
    findTenant: vi.fn(),
    nextJobNumber: vi.fn(),
}));
vi.mock("@/lib/workOrderEvents", () => ({ logEvent: vi.fn() }));

import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { logEvent } from "@/lib/workOrderEvents";
import { IN_HOUSE } from "@/lib/defaults";
import { archiveWorkOrder, createWorkOrder, restoreWorkOrder, updateWorkOrder } from "./actions";

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
