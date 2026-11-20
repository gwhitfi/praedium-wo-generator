import { describe, expect, it } from "vitest";
import { overdueReminderEmail } from "./overdueReminderEmail";

const organization = { name: "Oak & Pine <Rentals>", phone: "5551234567", email: "office@example.com" };
const job = {
    title: "Leaking <sink>",
    jobNumber: "2026-1001",
    address: "12 Main St, Unit 4B",
    dueDate: new Date("2026-11-14T00:00:00Z"),
    url: "https://app.example.com/wo/abc",
};
const second = {
    title: null,
    jobNumber: "2026-1002",
    address: "40 Elm St",
    dueDate: new Date("2026-11-16T00:00:00Z"),
    url: "https://app.example.com/wo/def",
};

describe("overdueReminderEmail", () => {
    it("names the job, the due date and the link", () => {
        const email = overdueReminderEmail({ organization, jobs: [job] });

        expect(email.subject).toBe("Past due: work order #2026-1001, Leaking <sink> — 12 Main St, Unit 4B");
        expect(email.text).toContain("was due Sat, Nov 14, 2026");
        expect(email.text).toContain("https://app.example.com/wo/abc");
        expect(email.text).toContain("office@example.com");
        expect(email.html).toContain('href="https://app.example.com/wo/abc"');
    });

    it("escapes user content in the HTML", () => {
        const email = overdueReminderEmail({ organization, jobs: [job] });

        expect(email.html).toContain("Leaking &lt;sink&gt;");
        expect(email.html).toContain("Oak &amp; Pine &lt;Rentals&gt;");
        expect(email.html).not.toContain("<sink>");
    });

    it("falls back to the organization's name without contact details", () => {
        const email = overdueReminderEmail({ organization: { name: "Oak", phone: null, email: null }, jobs: [job] });

        expect(email.text).toContain("let Oak know");
    });

    it("lists several work orders in one email, each with its own link", () => {
        const email = overdueReminderEmail({ organization, jobs: [job, second] });

        expect(email.subject).toBe("2 work orders past due — Oak & Pine <Rentals>");
        expect(email.text).toContain("#2026-1001 Leaking <sink>");
        expect(email.text).toContain("#2026-1002 Work order");
        expect(email.text).toContain("Due: Mon, Nov 16, 2026");
        expect(email.html).toContain('href="https://app.example.com/wo/abc"');
        expect(email.html).toContain('href="https://app.example.com/wo/def"');
        expect(email.html).toContain("Leaking &lt;sink&gt;");
        expect(email.html).not.toContain("<sink>");
    });
});
