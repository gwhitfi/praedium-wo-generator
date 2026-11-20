import { escapeHtml } from "./shared";
import { formatDueDate } from "@/lib/dates";
import { formatPhone } from "@/lib/phone";

export type OverdueJob = {
    title: string | null;
    jobNumber: string;
    address: string;
    dueDate: Date;
    url: string;
};

type OverdueReminderEmailInput = {
    organization: { name: string; phone: string | null; email: string | null };
    // At least one; the longest overdue first.
    jobs: OverdueJob[];
};

const button = (url: string) =>
    `<a href="${escapeHtml(url)}" style="display:inline-block;background:#171717;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 20px;border-radius:6px">View work order</a>`;

const page = (body: string) => `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;border:1px solid #e5e5e5">
${body}
      </table>
    </td></tr>
  </table>
</body>
</html>`;

// The automatic reminder to a contractor about their work orders that are past due (src/lib/overdueReminders.ts):
// one email per contractor and organization each day, listing every work order due a reminder that day.
export function overdueReminderEmail(input: OverdueReminderEmailInput): { subject: string; html: string; text: string } {
    const org = input.organization;
    const contact = [org.phone && formatPhone(org.phone), org.email].filter(Boolean) as string[];
    const reach = contact.length ? `${org.name} (${contact.join(" · ")})` : org.name;
    const jobs = input.jobs.map((job) => ({
        ...job,
        title: job.title ?? "Work order",
        due: formatDueDate(job.dueDate, { weekday: true }),
    }));
    const footer = `        <tr><td style="padding:16px 24px;border-top:1px solid #e5e5e5;font-size:12px;color:#737373">
          Need more time? Let ${escapeHtml(reach)} know.
        </td></tr>`;

    if (jobs.length === 1) {
        const [job] = jobs;
        const subject = `Past due: work order #${job.jobNumber}, ${job.title} — ${job.address}`;
        const text = [
            `This work order from ${org.name} was due ${job.due} and isn't marked complete yet.`,
            "",
            job.title,
            job.address,
            `Due: ${job.due}`,
            "",
            "If the work is done, open the work order and mark it complete:",
            job.url,
            "",
            `If you need more time, let ${reach} know.`,
        ].join("\n");
        const html = page(`        <tr><td style="padding:24px 24px 8px">
          <p style="margin:0 0 4px;font-size:12px;letter-spacing:.05em;text-transform:uppercase;color:#737373">${escapeHtml(org.name)}</p>
          <h1 style="margin:0 0 4px;font-size:20px;color:#171717">${escapeHtml(job.title)}</h1>
          <p style="margin:0;font-size:14px;color:#525252">${escapeHtml(job.address)}</p>
        </td></tr>
        <tr><td style="padding:16px 24px">
          <p style="margin:0;font-size:14px;line-height:1.5;color:#171717">This work order was due <strong>${escapeHtml(job.due)}</strong> and isn&#39;t marked complete yet. If the work is done, open it and mark it complete.</p>
        </td></tr>
        <tr><td style="padding:8px 24px 24px">
          ${button(job.url)}
          <p style="margin:12px 0 0;font-size:12px;color:#737373">Or open this link: <a href="${escapeHtml(job.url)}" style="color:#525252;word-break:break-all">${escapeHtml(job.url)}</a></p>
        </td></tr>
${footer}`);
        return { subject, html, text };
    }

    const subject = `${jobs.length} work orders past due — ${org.name}`;
    const text = [
        `These ${jobs.length} work orders from ${org.name} are past their due date and aren't marked complete yet.`,
        "If the work is done, open each one and mark it complete.",
        ...jobs.flatMap((job) => ["", `#${job.jobNumber} ${job.title}`, job.address, `Due: ${job.due}`, job.url]),
        "",
        `If you need more time, let ${reach} know.`,
    ].join("\n");
    const rows = jobs
        .map(
            (job) => `        <tr><td style="padding:16px 24px;border-top:1px solid #e5e5e5">
          <p style="margin:0 0 2px;font-size:12px;color:#737373">#${escapeHtml(job.jobNumber)}</p>
          <p style="margin:0 0 2px;font-size:16px;font-weight:600;color:#171717">${escapeHtml(job.title)}</p>
          <p style="margin:0 0 2px;font-size:14px;color:#525252">${escapeHtml(job.address)}</p>
          <p style="margin:0 0 12px;font-size:14px;color:#171717">Due <strong>${escapeHtml(job.due)}</strong></p>
          ${button(job.url)}
        </td></tr>`,
        )
        .join("\n");
    const html = page(`        <tr><td style="padding:24px 24px 16px">
          <p style="margin:0 0 4px;font-size:12px;letter-spacing:.05em;text-transform:uppercase;color:#737373">${escapeHtml(org.name)}</p>
          <h1 style="margin:0 0 8px;font-size:20px;color:#171717">${jobs.length} work orders past due</h1>
          <p style="margin:0;font-size:14px;line-height:1.5;color:#171717">These work orders are past their due date and aren&#39;t marked complete yet. If the work is done, open each one and mark it complete.</p>
        </td></tr>
${rows}
${footer}`);
    return { subject, html, text };
}
