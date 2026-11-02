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
        area: { findFirst: vi.fn(), create: vi.fn(), delete: vi.fn() },
        lineItem: { count: vi.fn(), findFirst: vi.fn(), create: vi.fn(), delete: vi.fn(), update: vi.fn() },
        $transaction: vi.fn(),
    },
}));
vi.mock("@/lib/email", () => ({ getAppUrl: vi.fn(() => "https://example.com"), sendEmail: vi.fn() }));
vi.mock("@/lib/emails/workOrderEmail", () => ({ workOrderEmail: vi.fn(() => ({ subject: "", html: "", text: "" })) }));
vi.mock("@/lib/emails/notifyCancelled", () => ({ notifyContractorsCancelled: vi.fn() }));
vi.mock("@/lib/storage", () => ({ deleteFiles: vi.fn(), lineItemPhotoKey: vi.fn(), uploadFile: vi.fn() }));
vi.mock("@/lib/attachments", () => ({ attachmentKeys: vi.fn(), onWorkOrders: vi.fn() }));
vi.mock("@/lib/workOrderCreate", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/workOrderCreate")>()),
    findTenant: vi.fn(),
    nextJobNumber: vi.fn(),
}));
vi.mock("@/lib/workOrderEvents", () => ({ logEvent: vi.fn() }));
vi.mock("@/lib/photos", () => ({
    checkPhoto: vi.fn(() => ({ ok: true, type: { mimeType: "image/jpeg" } })),
    MAX_PHOTO_BYTES: 3 * 1024 * 1024,
}));

import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { logEvent } from "@/lib/workOrderEvents";
import {
    addArea,
    addLineItem,
    archiveWorkOrder,
    cancelWorkOrder,
    closeWorkOrder,
    createWorkOrder,
    emailWorkOrder,
    markWorkOrderCompleted,
    regeneratePublicToken,
    removeArea,
    removeLineItem,
    removeLineItemPhoto,
    reopenWorkOrder,
    restoreWorkOrder,
    sendWorkOrder,
    setLineItemPhoto,
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
    sentAt: null,
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
        vi.mocked(sendEmail).mockRejectedValue(new Error("Resend is down"));
        vi.spyOn(console, "error").mockImplementation(() => {});

        expect((await emailWorkOrder("wo1")).ok).toBe(false);
        expect(logEvent).not.toHaveBeenCalled();
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
});
