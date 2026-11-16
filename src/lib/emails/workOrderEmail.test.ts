import { describe, expect, it } from "vitest";
import { workOrderEmail } from "./workOrderEmail";
import { escapeHtml } from "./shared";

const organization = { name: "Acme Property", phone: "864-555-0100", email: "office@acme.test" };
const base = {
    organization,
    title: "Fix leaking toilet",
    jobNumber: "2026-1001",
    address: "12 Oak St, Greenville, SC 29601",
    dueDate: null,
    notes: null,
    itemCount: 3,
    url: "https://www.workorderfox.com/wo/abc123",
    isResend: false,
};

// Unique per field, so each assertion proves that particular field was escaped.
const hostile = (field: string) => `<b>${field}</b> "Tom" & 'Jerry'`;

describe("workOrderEmail", () => {
    it("builds the subject for a new work order", () => {
        expect(workOrderEmail(base).subject).toBe(
            "New work order #2026-1001: Fix leaking toilet — 12 Oak St, Greenville, SC 29601",
        );
    });

    it("calls a resend a reminder", () => {
        expect(workOrderEmail({ ...base, isResend: true }).subject).toBe(
            "Reminder #2026-1001: Fix leaking toilet — 12 Oak St, Greenville, SC 29601",
        );
    });

    it("escapes user content in the HTML and leaves the text version as-is", () => {
        const fields = {
            title: hostile("title"),
            address: hostile("address"),
            notes: hostile("notes"),
            name: hostile("org"),
            phone: hostile("phone"),
            email: hostile("email"),
        };
        const email = workOrderEmail({
            ...base,
            title: fields.title,
            address: fields.address,
            notes: fields.notes,
            organization: { name: fields.name, phone: fields.phone, email: fields.email },
        });

        for (const value of Object.values(fields)) {
            expect(email.html).not.toContain(value);
            expect(email.html).toContain(escapeHtml(value));
            expect(email.text).toContain(value);
        }
        expect(email.html).not.toContain("<b>");
    });

    it("escapes the link inside href", () => {
        const url = 'https://www.workorderfox.com/wo/abc?a=1&b="x"';
        const email = workOrderEmail({ ...base, url });

        expect(email.html).toContain(`href="${escapeHtml(url)}"`);
        expect(email.html).not.toContain(url);
        expect(email.text).toContain(url);
    });

    it("counts one item and several items", () => {
        expect(workOrderEmail({ ...base, itemCount: 1 }).text).toContain("Work items: 1 item\n");
        expect(workOrderEmail({ ...base, itemCount: 2 }).text).toContain("Work items: 2 items\n");
    });

    it("shows the due date with its weekday", () => {
        const email = workOrderEmail({ ...base, dueDate: new Date("2026-10-02") });
        expect(email.text).toContain("Due: Fri, Oct 2, 2026");
        expect(email.html).toContain("Fri, Oct 2, 2026");
    });

    it("leaves out the due date and notes when there are none", () => {
        const email = workOrderEmail(base);
        expect(email.text).not.toContain("Due:");
        expect(email.html).not.toContain(">Due<");
        expect(email.text).not.toContain("Notes:");
        expect(email.html).not.toContain(">Notes<");
    });

    it('uses "Work order" when there is no title', () => {
        expect(workOrderEmail({ ...base, title: null }).subject).toBe(
            "New work order #2026-1001: Work order — 12 Oak St, Greenville, SC 29601",
        );
    });

    it("leaves out the contact line when there is no phone or email", () => {
        const email = workOrderEmail({ ...base, organization: { ...organization, phone: null, email: null } });
        expect(email.text).not.toContain("Questions?");
        expect(email.html).not.toContain("Questions?");
    });
});
