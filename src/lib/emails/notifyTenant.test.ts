import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/emailLog", () => ({ sendLoggedEmail: vi.fn() }));

import { after } from "next/server";
import { sendLoggedEmail } from "@/lib/emailLog";
import { notifyTenant } from "./notifyTenant";
import { tenantNotifiedEmail } from "./tenantNotifiedEmail";

const sendEmail = vi.mocked(sendLoggedEmail);
const organization = { id: "org1", name: "Acme Property", phone: "864-555-0100", email: "office@acme.test" };
const workOrder = {
    id: "wo1",
    title: "Fix kitchen sink",
    address: "12 Oak St, Unit 2, Greenville, SC 29601",
    notifyTenant: true,
    tenantEmail: "pat@example.com",
    contractor: { displayName: "Joe Smith", company: "Joe's Plumbing" },
};

// Runs the task notifyTenant handed to after().
async function runAfter(): Promise<void> {
    const task = vi.mocked(after).mock.calls[0][0] as () => Promise<void>;
    await task();
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("notifyTenant", () => {
    it("emails the tenant after the response, with replies going to the office", async () => {
        expect(notifyTenant(organization, workOrder)).toBe(true);
        expect(sendEmail).not.toHaveBeenCalled();

        await runAfter();

        expect(sendEmail).toHaveBeenCalledWith({
            organizationId: "org1",
            kind: "TENANT_NOTICE",
            workOrderId: "wo1",
            to: "pat@example.com",
            ...tenantNotifiedEmail({
                organization,
                title: "Fix kitchen sink",
                address: "12 Oak St, Unit 2, Greenville, SC 29601",
                contractor: { name: "Joe Smith", company: "Joe's Plumbing" },
            }),
            replyTo: "office@acme.test",
            fromName: "Acme Property",
        });
    });

    it("does nothing when the box wasn't checked", () => {
        expect(notifyTenant(organization, { ...workOrder, notifyTenant: false })).toBe(false);
        expect(after).not.toHaveBeenCalled();
    });

    it.each([null, "", "  "])("does nothing when the tenant email is %j", (tenantEmail) => {
        expect(notifyTenant(organization, { ...workOrder, tenantEmail })).toBe(false);
        expect(after).not.toHaveBeenCalled();
    });

    it("logs a failed send instead of throwing", async () => {
        sendEmail.mockRejectedValue(new Error("Resend is down"));
        const log = vi.spyOn(console, "error").mockImplementation(() => {});

        notifyTenant(organization, workOrder);
        await runAfter();

        expect(log).toHaveBeenCalledWith("Tenant notice failed for work order wo1", expect.any(Error));
    });
});
