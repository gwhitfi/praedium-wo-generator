import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
    default: {
        workOrder: { findFirst: vi.fn(), update: vi.fn() },
        lineItem: { count: vi.fn() },
    },
}));
vi.mock("@/lib/email", () => ({ getAppUrl: vi.fn(() => "https://example.com") }));
vi.mock("@/lib/emailLog", () => ({ sendLoggedEmail: vi.fn() }));
vi.mock("@/lib/emails/workOrderEmail", () => ({ workOrderEmail: vi.fn(() => ({ subject: "", html: "", text: "" })) }));
vi.mock("@/lib/emails/notifyTenant", () => ({ notifyTenant: vi.fn(() => false) }));
vi.mock("@/lib/workOrderEvents", () => ({ logEvent: vi.fn() }));
vi.mock("@/lib/rateLimit", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/rateLimit")>()),
    rateLimit: vi.fn(),
}));

import { sendLoggedEmail as sendEmail } from "@/lib/emailLog";
import { notifyTenant } from "@/lib/emails/notifyTenant";
import { workOrderEmail } from "@/lib/emails/workOrderEmail";
import prisma from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";
import { logEvent } from "@/lib/workOrderEvents";
import { emailWorkOrderToContractor } from "./workOrderSend";

const organization = { name: "Acme Property", phone: null, email: "office@acme.test" };
const user = { id: "user1", firstName: "Justin", lastName: "W", email: "j@example.com" };
const contractor = { id: "joes", displayName: "Joe's Plumbing", phone: null, email: "joe@example.com" };
const send = { organizationId: "org1", organization, user, workOrderId: "wo1" };

function withWorkOrder(overrides: Record<string, unknown> = {}) {
    vi.mocked(prisma.workOrder.findFirst).mockResolvedValue({
        id: "wo1",
        organizationId: "org1",
        jobNumber: "2026-1001",
        publicToken: "token1",
        status: "DRAFT",
        archived: false,
        title: "Fix sink",
        notes: null,
        dueDate: null,
        deliveryMethod: null,
        contractor,
        property: { addressLine1: "12 Oak St", city: "Greenville", state: "SC", zipCode: "29601" },
        unit: null,
        ...overrides,
    } as never);
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.lineItem.count).mockResolvedValue(2);
    vi.mocked(rateLimit).mockResolvedValue({ ok: true, remaining: 1, retryAfterSeconds: 0 });
    withWorkOrder();
});

describe("emailWorkOrderToContractor", () => {
    it("refuses to send a draft with no line items, without emailing or using the rate limit", async () => {
        vi.mocked(prisma.lineItem.count).mockResolvedValue(0);

        await expect(emailWorkOrderToContractor(send)).resolves.toEqual({
            ok: false,
            error: "Add at least one line item before sending",
        });
        expect(sendEmail).not.toHaveBeenCalled();
        expect(rateLimit).not.toHaveBeenCalled();
        expect(prisma.workOrder.update).not.toHaveBeenCalled();
    });

    it("still resends a sent work order whose items were all removed", async () => {
        vi.mocked(prisma.lineItem.count).mockResolvedValue(0);
        withWorkOrder({ status: "SENT", deliveryMethod: "EMAIL" });

        await expect(emailWorkOrderToContractor(send)).resolves.toMatchObject({ ok: true, resent: true });
    });

    it("emails a draft's contractor from the organization, marks it sent and logs it", async () => {
        vi.mocked(notifyTenant).mockReturnValueOnce(true);

        await expect(emailWorkOrderToContractor(send)).resolves.toEqual({
            ok: true,
            to: "joe@example.com",
            jobNumber: "2026-1001",
            resent: false,
            tenantNotified: true,
        });
        expect(vi.mocked(prisma.workOrder.findFirst).mock.calls[0][0]).toMatchObject({
            where: { id: "wo1", organizationId: "org1" },
        });
        expect(workOrderEmail).toHaveBeenCalledWith(
            expect.objectContaining({ organization, url: "https://example.com/wo/token1", isResend: false }),
        );
        expect(sendEmail).toHaveBeenCalledWith(
            expect.objectContaining({
                organizationId: "org1",
                kind: "WORK_ORDER",
                workOrderId: "wo1",
                to: "joe@example.com",
                replyTo: "office@acme.test",
                fromName: "Acme Property",
            }),
        );
        expect(vi.mocked(prisma.workOrder.update).mock.calls[0][0].data).toMatchObject({
            deliveryMethod: "EMAIL",
            status: "SENT",
        });
        expect(logEvent).toHaveBeenCalledWith({
            type: "SENT",
            workOrderId: "wo1",
            organizationId: "org1",
            actor: { kind: "office", user },
            detail: { deliveryMethod: "EMAIL", resent: false, tenantNotified: true },
        });
    });

    it("re-sends an in-progress work order without changing its status or emailing the tenant", async () => {
        withWorkOrder({ status: "IN_PROGRESS", deliveryMethod: "EMAIL" });

        await expect(emailWorkOrderToContractor(send)).resolves.toMatchObject({ ok: true, resent: true });
        expect(vi.mocked(prisma.workOrder.update).mock.calls[0][0].data).not.toHaveProperty("status");
        expect(notifyTenant).not.toHaveBeenCalled();
    });

    it.each([
        [{ archived: true }, "Archived work orders can't be emailed"],
        [{ status: "COMPLETED" }, "Only open work orders can be emailed"],
        [{ contractor: null }, "Assign a contractor before sending"],
        [{ inHouse: true, contractor: null }, "This work order is handled in-house, so there's no contractor to email"],
        [{ contractor: { ...contractor, email: " " } }, "Joe's Plumbing has no email address"],
    ])("refuses %o", async (overrides, error) => {
        withWorkOrder(overrides);

        await expect(emailWorkOrderToContractor(send)).resolves.toEqual({ ok: false, error });
        expect(sendEmail).not.toHaveBeenCalled();
        expect(prisma.workOrder.update).not.toHaveBeenCalled();
        expect(logEvent).not.toHaveBeenCalled();
    });

    it("issues a new link when the contact's email differs from the one it was sent to", async () => {
        withWorkOrder({ status: "SENT", deliveryMethod: "EMAIL", contractorEmail: "old@example.com" });

        await expect(emailWorkOrderToContractor(send)).resolves.toMatchObject({ ok: true });

        // The new link is saved on its own first, then the email goes out, then the work order is marked sent.
        const updates = vi.mocked(prisma.workOrder.update).mock.calls.map((call) => call[0]);
        expect(updates).toHaveLength(2);
        const saved = updates[0] as { where: unknown; data: { publicToken: string } };
        expect(saved.where).toEqual({ id: "wo1" });
        expect(Object.keys(saved.data)).toEqual(["publicToken"]);
        expect(saved.data.publicToken).toMatch(/^[A-Za-z0-9_-]{32}$/);
        expect(saved.data.publicToken).not.toBe("token1");
        expect(updates[1].data).not.toHaveProperty("publicToken");
        expect(vi.mocked(prisma.workOrder.update).mock.invocationCallOrder[0]).toBeLessThan(
            vi.mocked(sendEmail).mock.invocationCallOrder[0],
        );
        expect(vi.mocked(sendEmail).mock.invocationCallOrder[0]).toBeLessThan(
            vi.mocked(prisma.workOrder.update).mock.invocationCallOrder[1],
        );
        expect(workOrderEmail).toHaveBeenCalledWith(
            expect.objectContaining({ url: `https://example.com/wo/${saved.data.publicToken}` }),
        );
    });

    it("sends nothing, and says why, when the new link can't be saved", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        withWorkOrder({ status: "SENT", deliveryMethod: "EMAIL", contractorEmail: "old@example.com" });
        vi.mocked(prisma.workOrder.update).mockRejectedValueOnce(new Error("database down"));

        expect(await emailWorkOrderToContractor(send)).toEqual({
            ok: false,
            error: "Couldn't save the new contractor link, so nothing was sent. Try again.",
        });
        expect(sendEmail).not.toHaveBeenCalled();
        expect(prisma.workOrder.update).toHaveBeenCalledTimes(1);
        expect(logEvent).not.toHaveBeenCalled();
    });

    describe("a draft that was cancelled and reopened", () => {
        const reopened = { status: "DRAFT", deliveryMethod: "EMAIL", sentAt: new Date("2026-11-03") };

        it("doesn't email the tenant again unless asked (MCP never asks)", async () => {
            withWorkOrder(reopened);
            vi.mocked(notifyTenant).mockReturnValue(true);

            await expect(emailWorkOrderToContractor(send)).resolves.toMatchObject({ ok: true, tenantNotified: false });
            expect(notifyTenant).not.toHaveBeenCalled();
        });

        it("emails the tenant again when the office leaves the box ticked", async () => {
            withWorkOrder(reopened);
            vi.mocked(notifyTenant).mockReturnValue(true);

            await expect(emailWorkOrderToContractor({ ...send, notifyTenantAgain: true })).resolves.toMatchObject({
                ok: true,
                tenantNotified: true,
            });
            expect(notifyTenant).toHaveBeenCalledTimes(1);
        });
    });

    it("keeps the new link but doesn't mark it sent when the email fails", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        withWorkOrder({ contractorEmail: "old@example.com" });
        vi.mocked(sendEmail).mockRejectedValueOnce(new Error("Resend is down"));

        expect(await emailWorkOrderToContractor(send)).toEqual({ ok: false, error: "Resend is down" });
        expect(prisma.workOrder.update).toHaveBeenCalledTimes(1);
        expect(logEvent).not.toHaveBeenCalled();
    });

    it("doesn't call it a reminder when a draft that was emailed before (cancelled, then reopened) goes out again", async () => {
        withWorkOrder({ status: "DRAFT", deliveryMethod: "EMAIL", contractorEmail: "joe@example.com" });

        await emailWorkOrderToContractor(send);

        expect(workOrderEmail).toHaveBeenCalledWith(expect.objectContaining({ isResend: false }));
    });

    it("keeps the link when the email is the same apart from case and spaces", async () => {
        withWorkOrder({ status: "SENT", deliveryMethod: "EMAIL", contractorEmail: " Joe@Example.com" });

        await emailWorkOrderToContractor(send);

        expect(vi.mocked(prisma.workOrder.update).mock.calls[0][0].data).not.toHaveProperty("publicToken");
        expect(workOrderEmail).toHaveBeenCalledWith(expect.objectContaining({ url: "https://example.com/wo/token1" }));
    });

    it("refuses a work order outside the organization", async () => {
        vi.mocked(prisma.workOrder.findFirst).mockResolvedValue(null);
        await expect(emailWorkOrderToContractor(send)).resolves.toEqual({ ok: false, error: "Work order not found" });
    });

    it("refuses when the organization is over its hourly email limit", async () => {
        vi.mocked(rateLimit).mockResolvedValue({ ok: false, remaining: 0, retryAfterSeconds: 600 });

        await expect(emailWorkOrderToContractor(send)).resolves.toEqual({
            ok: false,
            error: "Too many emails sent in the last hour. Try again later.",
        });
        expect(rateLimit).toHaveBeenCalledWith("email:org1", expect.any(Object));
        expect(sendEmail).not.toHaveBeenCalled();
        expect(prisma.workOrder.update).not.toHaveBeenCalled();
    });
});
