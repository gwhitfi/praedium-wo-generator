import { escapeHtml } from "./shared";

type VerifyCodeEmailInput = {
    organizationName: string;
    jobNumber: string;
    code: string;
    url: string;
};

// The 6-digit code a contractor enters to verify a browser, with a link to the confirm page as an alternative.
export function verifyCodeEmail(input: VerifyCodeEmailInput): { subject: string; html: string; text: string } {
    const spaced = `${input.code.slice(0, 3)} ${input.code.slice(3)}`;
    const context = `${input.organizationName} · #${input.jobNumber}`;
    const subject = `Your Praedium code: ${spaced}`;

    const text = [
        context,
        "",
        "Enter this code on the work order page to verify it's you:",
        "",
        spaced,
        "",
        "It expires in 10 minutes. If you didn't request it, ignore this email.",
        "",
        "Or open this link on this phone:",
        input.url,
    ].join("\n");

    const html = `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;border:1px solid #e5e5e5">
        <tr><td style="padding:24px 24px 8px">
          <p style="margin:0 0 12px;font-size:12px;letter-spacing:.05em;text-transform:uppercase;color:#737373">${escapeHtml(context)}</p>
          <p style="margin:0;font-size:14px;color:#171717">Enter this code on the work order page to verify it&#39;s you:</p>
          <p style="margin:16px 0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:32px;font-weight:700;letter-spacing:.15em;color:#171717">${escapeHtml(spaced)}</p>
          <p style="margin:0;font-size:14px;color:#525252">It expires in 10 minutes. If you didn&#39;t request it, ignore this email.</p>
        </td></tr>
        <tr><td style="padding:16px 24px 24px">
          <a href="${escapeHtml(input.url)}" style="display:inline-block;background:#171717;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 20px;border-radius:6px">Open on this phone</a>
          <p style="margin:12px 0 0;font-size:12px;color:#737373">Or open this link: <a href="${escapeHtml(input.url)}" style="color:#525252;word-break:break-all">${escapeHtml(input.url)}</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    return { subject, html, text };
}
