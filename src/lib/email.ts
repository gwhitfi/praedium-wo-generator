import { Resend } from "resend";

let client: Resend | null = null;

function getClient() {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("Email is not configured: RESEND_API_KEY is missing");
    client ??= new Resend(apiKey);
    return client;
}

export function getAppUrl() {
    const url = process.env.APP_URL;
    if (!url) throw new Error("Email is not configured: APP_URL is missing");
    return url.replace(/\/+$/, "");
}

export function formatFrom(from: string, name?: string | null) {
    const address = from.match(/<([^>]+)>/)?.[1] ?? from;
    if (!name) return `"Work Order Fox" <${address}>`;
    const displayName = name.replace(/["\\<>\r\n]/g, "");
    return `"${displayName} via Work Order Fox" <${address}>`;
}

export async function sendEmail({
    to,
    subject,
    html,
    text,
    replyTo,
    fromName,
}: {
    to: string;
    subject: string;
    html: string;
    text: string;
    replyTo?: string | null;
    fromName?: string | null;
}) {
    const from = process.env.EMAIL_FROM;
    if (!from) throw new Error("Email is not configured: EMAIL_FROM is missing");

    const { data, error } = await getClient().emails.send({
        from: formatFrom(from, fromName),
        to,
        subject,
        html,
        text,
        ...(replyTo ? { replyTo } : {}),
    });

    if (error) throw new Error(`Email failed to send: ${error.message}`);
    return data;
}
