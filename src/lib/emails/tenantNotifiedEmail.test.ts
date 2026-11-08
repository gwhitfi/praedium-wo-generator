import { describe, expect, it } from "vitest";
import { tenantNotifiedEmail } from "./tenantNotifiedEmail";
import { escapeHtml } from "./shared";

const organization = { name: "Acme Property", phone: "864-555-0100", email: "office@acme.test" };
const base = {
    organization,
    title: "Fix kitchen sink",
    address: "12 Oak St, Unit 2, Greenville, SC 29601",
    contractor: { name: "Joe Smith", company: "Joe's Plumbing" },
};

// Unique per field, so each assertion proves that particular field was escaped.
const hostile = (field: string) => `<b>${field}</b> "Tom" & 'Jerry'`;

describe("tenantNotifiedEmail", () => {
    it("builds the subject from the address", () => {
        expect(tenantNotifiedEmail(base).subject).toBe(
            "A contractor will contact you about a repair at 12 Oak St, Unit 2, Greenville, SC 29601",
        );
    });

    it("says the office's own team will be in touch when there's no contractor (in-house)", () => {
        const email = tenantNotifiedEmail({ ...base, contractor: null });
        expect(email.subject).toBe(
            "Acme Property will contact you about a repair at 12 Oak St, Unit 2, Greenville, SC 29601",
        );
        expect(email.text).toContain("Acme Property's own team is handling a work order");
        expect(email.text).not.toContain("Contractor:");
        expect(email.html).not.toContain("Contractor");
        expect(email.html).toContain("Acme Property will contact you</h1>");
    });

    it("escapes the organization's name in the in-house heading", () => {
        const email = tenantNotifiedEmail({
            ...base,
            contractor: null,
            organization: { ...organization, name: hostile("org") },
        });
        expect(email.html).not.toContain(hostile("org"));
        expect(email.html).toContain(`${escapeHtml(hostile("org"))} will contact you</h1>`);
    });

    it("names the contractor and their company, and the work", () => {
        const email = tenantNotifiedEmail(base);
        expect(email.text).toContain("Contractor: Joe Smith (Joe's Plumbing)\n");
        expect(email.text).toContain("Work: Fix kitchen sink\n");
        expect(email.text).toContain("They'll contact you to arrange a time.");
    });

    it("shows the company once when it's the same as the contractor's name", () => {
        const email = tenantNotifiedEmail({ ...base, contractor: { name: "Joe's Plumbing", company: "joe's plumbing" } });
        expect(email.text).toContain("Contractor: Joe's Plumbing\n");
    });

    it("shows just the name when there's no company", () => {
        const email = tenantNotifiedEmail({ ...base, contractor: { name: "Joe Smith", company: null } });
        expect(email.text).toContain("Contractor: Joe Smith\n");
    });

    it("leaves out the work line when there's no title", () => {
        const email = tenantNotifiedEmail({ ...base, title: null });
        expect(email.text).not.toContain("Work:");
        expect(email.html).not.toContain(">Work<");
    });

    it("never includes a due date", () => {
        const email = tenantNotifiedEmail(base);
        expect(email.text).not.toMatch(/due/i);
        expect(email.html).not.toMatch(/due/i);
    });

    it("tells the tenant how to reach the office about problems", () => {
        const problems = (org: { name: string; phone: string | null; email: string | null }) =>
            tenantNotifiedEmail({ ...base, organization: org }).text;

        expect(problems(organization)).toContain(
            "If there are any problems, call Acme Property at (864) 555-0100 or email office@acme.test.",
        );
        expect(problems({ ...organization, email: null })).toContain(
            "If there are any problems, call Acme Property at (864) 555-0100.",
        );
        expect(problems({ ...organization, phone: null })).toContain(
            "If there are any problems, contact Acme Property at office@acme.test.",
        );
        expect(problems({ ...organization, phone: null, email: null })).toContain(
            "If there are any problems, contact Acme Property.",
        );
    });

    it("escapes user content in the HTML and leaves the text version as-is", () => {
        const fields = {
            title: hostile("title"),
            address: hostile("address"),
            contractor: hostile("contractor"),
            company: hostile("company"),
            name: hostile("org"),
            email: hostile("email"),
        };
        const email = tenantNotifiedEmail({
            title: fields.title,
            address: fields.address,
            contractor: { name: fields.contractor, company: fields.company },
            organization: { name: fields.name, phone: null, email: fields.email },
        });

        for (const value of Object.values(fields)) {
            expect(email.html).not.toContain(value);
            expect(email.html).toContain(escapeHtml(value));
            expect(email.text).toContain(value);
        }
        expect(email.html).not.toContain("<b>");
    });
});
