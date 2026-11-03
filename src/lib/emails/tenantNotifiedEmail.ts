import { escapeHtml } from "./shared";
import { formatPhone } from "@/lib/phone";

type TenantNotifiedEmailInput = {
    organization: { name: string; phone: string | null; email: string | null };
    title: string | null;
    address: string;
    contractor: { name: string; company: string | null };
};

// The one email a tenant gets: their work order went to a contractor, who will contact them.
// No due date on purpose, so the tenant and contractor don't argue over a date the office set.
export function tenantNotifiedEmail(input: TenantNotifiedEmailInput): { subject: string; html: string; text: string } {
    const org = input.organization;
    const company = input.contractor.company?.trim();
    const contractor =
        company && company.toLowerCase() !== input.contractor.name.trim().toLowerCase()
            ? `${input.contractor.name} (${company})`
            : input.contractor.name;

    const phone = org.phone ? formatPhone(org.phone) : null;
    const problems =
        phone && org.email
            ? `If there are any problems, call ${org.name} at ${phone} or email ${org.email}.`
            : phone
              ? `If there are any problems, call ${org.name} at ${phone}.`
              : org.email
                ? `If there are any problems, contact ${org.name} at ${org.email}.`
                : `If there are any problems, contact ${org.name}.`;

    const subject = `A contractor will contact you about a repair at ${input.address}`;
    const summary = `${org.name} has sent a work order for ${input.address} to a contractor. They'll contact you to arrange a time.`;

    const text = [
        summary,
        "",
        `Contractor: ${contractor}`,
        input.title ? `Work: ${input.title}` : null,
        "",
        problems,
    ]
        .filter((line) => line !== null)
        .join("\n");

    const row = (label: string, value: string) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#737373;white-space:nowrap;vertical-align:top">${label}</td>` +
        `<td style="padding:4px 0;color:#171717">${value}</td></tr>`;

    const html = `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;border:1px solid #e5e5e5">
        <tr><td style="padding:24px 24px 8px">
          <p style="margin:0 0 4px;font-size:12px;letter-spacing:.05em;text-transform:uppercase;color:#737373">${escapeHtml(org.name)}</p>
          <h1 style="margin:0 0 4px;font-size:20px;color:#171717">A contractor will contact you</h1>
          <p style="margin:0;font-size:14px;color:#525252">${escapeHtml(input.address)}</p>
        </td></tr>
        <tr><td style="padding:16px 24px">
          <p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:#171717">${escapeHtml(summary)}</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px">
            ${row("Contractor", escapeHtml(contractor))}
            ${input.title ? row("Work", escapeHtml(input.title)) : ""}
          </table>
        </td></tr>
        <tr><td style="padding:16px 24px 24px;border-top:1px solid #e5e5e5">
          <p style="margin:0;font-size:14px;line-height:1.5;color:#171717">${escapeHtml(problems)}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    return { subject, html, text };
}
