import { Resend } from "resend";
import { handleResendReport, type ResendReport } from "@/lib/resendWebhook";

// Resend's delivery reports (delivered, bounced, complained). Public, but only signed requests are read: the
// signature is checked with RESEND_WEBHOOK_SECRET from the webhook's settings in Resend.
export async function POST(request: Request): Promise<Response> {
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    const apiKey = process.env.RESEND_API_KEY;
    if (!secret || !apiKey) {
        console.error("Resend webhook: RESEND_WEBHOOK_SECRET or RESEND_API_KEY is not set");
        return new Response("Not configured", { status: 503 });
    }

    const payload = await request.text();
    let report: ResendReport;
    try {
        report = new Resend(apiKey).webhooks.verify({
            payload,
            headers: {
                id: request.headers.get("svix-id") ?? request.headers.get("webhook-id") ?? "",
                timestamp: request.headers.get("svix-timestamp") ?? request.headers.get("webhook-timestamp") ?? "",
                signature: request.headers.get("svix-signature") ?? request.headers.get("webhook-signature") ?? "",
            },
            webhookSecret: secret,
        }) as ResendReport;
    } catch {
        return new Response("Invalid signature", { status: 400 });
    }

    try {
        await handleResendReport(report);
    } catch (error) {
        // A 500 makes Resend retry later, which is what's wanted for a database hiccup.
        console.error(`Resend webhook: ${report.type} failed`, error);
        return new Response("Failed", { status: 500 });
    }
    return new Response("OK");
}
