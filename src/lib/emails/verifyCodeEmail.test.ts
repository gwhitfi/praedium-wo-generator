import { describe, expect, it } from "vitest";
import { verifyCodeEmail } from "./verifyCodeEmail";
import { escapeHtml } from "./shared";

const base = {
    organizationName: "Acme Property",
    jobNumber: "2026-1001",
    code: "042917",
    url: "https://workorder.dev/wo/abc123/verify?c=ch1.042917",
};

describe("verifyCodeEmail", () => {
    it("puts the code in the subject as one string", () => {
        expect(verifyCodeEmail(base).subject).toBe("Your Praedium code: 042917");
    });

    it("includes the code, the link and the job in both versions", () => {
        const email = verifyCodeEmail(base);
        for (const body of [email.html, email.text]) {
            expect(body).toContain("042917");
            expect(body).not.toContain("042 917");
            expect(body).toContain("#2026-1001");
            expect(body).toContain("expires in 10 minutes");
        }
        expect(email.text).toContain(base.url);
        expect(email.html).toContain(`href="${escapeHtml(base.url)}"`);
        expect(email.html).toContain("Open on this phone");
    });

    it("escapes the organization name in the HTML", () => {
        const organizationName = `<b>Acme</b> "Tom" & 'Jerry'`;
        const email = verifyCodeEmail({ ...base, organizationName });

        expect(email.html).not.toContain(organizationName);
        expect(email.html).toContain(escapeHtml(organizationName));
        expect(email.html).not.toContain("<b>");
        expect(email.text).toContain(organizationName);
    });
});
