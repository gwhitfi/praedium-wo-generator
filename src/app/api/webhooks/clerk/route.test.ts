import { createHmac, randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/clerkWebhook", () => ({ handleClerkEvent: vi.fn() }));

import { handleClerkEvent } from "@/lib/clerkWebhook";
import { POST } from "./route";

const secretBytes = randomBytes(24);
const secret = `whsec_${secretBytes.toString("base64")}`;

// Signs a body the way Clerk (Svix) does: HMAC-SHA256 of "<id>.<timestamp>.<body>".
function signed(body: string, key: Buffer = secretBytes): NextRequest {
    const id = "msg_1";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
    return new NextRequest("https://example.com/api/webhooks/clerk", {
        method: "POST",
        headers: { "svix-id": id, "svix-timestamp": timestamp, "svix-signature": `v1,${signature}` },
        body,
    });
}

const event = { type: "organization.deleted", object: "event", data: { id: "clerk_org1", deleted: true } };

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CLERK_WEBHOOK_SIGNING_SECRET", secret);
});

afterEach(() => {
    vi.unstubAllEnvs();
});

describe("POST /api/webhooks/clerk", () => {
    it("hands a correctly signed event to the handler", async () => {
        const response = await POST(signed(JSON.stringify(event)));

        expect(response.status).toBe(200);
        expect(handleClerkEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "organization.deleted" }));
    });

    it("refuses an event signed with another secret, without reading it", async () => {
        const response = await POST(signed(JSON.stringify(event), randomBytes(24)));

        expect(response.status).toBe(400);
        expect(handleClerkEvent).not.toHaveBeenCalled();
    });

    it("answers 503 when the secret isn't set", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        vi.stubEnv("CLERK_WEBHOOK_SIGNING_SECRET", "");

        expect((await POST(signed(JSON.stringify(event)))).status).toBe(503);
        expect(handleClerkEvent).not.toHaveBeenCalled();
    });

    it("answers 500 so Clerk retries when the handler fails", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        vi.mocked(handleClerkEvent).mockRejectedValue(new Error("database down"));

        expect((await POST(signed(JSON.stringify(event)))).status).toBe(500);
    });
});
