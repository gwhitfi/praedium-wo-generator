import type { NextRequest } from "next/server";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { WebhookEvent } from "@clerk/nextjs/webhooks";
import { handleClerkEvent } from "@/lib/clerkWebhook";

// Clerk's user, organization and membership changes. Public, but only signed requests are read: verifyWebhook()
// checks the signature with CLERK_WEBHOOK_SIGNING_SECRET from the endpoint's settings in Clerk.
export async function POST(request: NextRequest): Promise<Response> {
    if (!process.env.CLERK_WEBHOOK_SIGNING_SECRET) {
        console.error("Clerk webhook: CLERK_WEBHOOK_SIGNING_SECRET is not set");
        return new Response("Not configured", { status: 503 });
    }

    let event: WebhookEvent;
    try {
        event = await verifyWebhook(request);
    } catch {
        return new Response("Invalid signature", { status: 400 });
    }

    try {
        await handleClerkEvent(event);
    } catch (error) {
        // A 500 makes Clerk retry later, which is what's wanted for a database hiccup.
        console.error(`Clerk webhook: ${event.type} failed`, error);
        return new Response("Failed", { status: 500 });
    }
    return new Response("OK");
}
