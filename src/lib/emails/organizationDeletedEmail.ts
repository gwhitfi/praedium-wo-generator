import { escapeHtml } from "./shared";
import { dateInAppTimeZone, formatFullDate, formatFullTimestamp } from "@/lib/dates";

type OrganizationDeletedEmailInput = {
    organizationName: string;
    // Who deleted it, as the activity log names them.
    deletedBy: string;
    deletedAt: Date;
    // restoreDeadline(deletedAt) from src/lib/cleanup.ts.
    restoreDeadline: Date;
    setupUrl: string;
};

// Sent to every admin when an organization is deleted in Settings: it's locked now and its data goes after the
// restore deadline, unless an admin restores it from /setup. No restore link: restoring needs a signed-in admin.
export function organizationDeletedEmail(input: OrganizationDeletedEmailInput): {
    subject: string;
    html: string;
    text: string;
} {
    const name = input.organizationName;
    const deadlineDay = formatFullDate(dateInAppTimeZone(input.restoreDeadline));
    const deadline = formatFullTimestamp(input.restoreDeadline);

    const subject = `${name} will be deleted on ${deadlineDay}`;
    const what = `${input.deletedBy} deleted ${name} in Praedium on ${formatFullTimestamp(input.deletedAt)}.`;
    const locked =
        "It's locked for everyone now: no one can open it, and its API keys and contractor links don't work.";
    const removed = `After ${deadline}, every property, contact, work order, photo, activity entry, email record and API key in it is deleted for good.`;
    const restore = `Changed your mind? Any admin can restore it until then: sign in at ${input.setupUrl} and choose Restore.`;
    const why = `You're getting this because you're an admin of ${name}.`;

    const text = [what, "", locked, "", removed, "", restore, "", why].join("\n");

    const paragraph = (content: string) =>
        `<p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:#171717">${content}</p>`;

    const html = `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;border:1px solid #e5e5e5">
        <tr><td style="padding:24px 24px 8px">
          <p style="margin:0 0 4px;font-size:12px;letter-spacing:.05em;text-transform:uppercase;color:#b91c1c">Scheduled for deletion</p>
          <h1 style="margin:0;font-size:20px;color:#171717">${escapeHtml(subject)}</h1>
        </td></tr>
        <tr><td style="padding:16px 24px 12px">
          ${paragraph(escapeHtml(what))}
          ${paragraph(escapeHtml(locked))}
          ${paragraph(escapeHtml(removed))}
          ${paragraph(
              `Changed your mind? Any admin can restore it until then: sign in at <a href="${escapeHtml(input.setupUrl)}" style="color:#171717">${escapeHtml(input.setupUrl)}</a> and choose Restore.`,
          )}
        </td></tr>
        <tr><td style="padding:16px 24px;border-top:1px solid #e5e5e5;font-size:12px;color:#737373">
          ${escapeHtml(why)}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    return { subject, html, text };
}
