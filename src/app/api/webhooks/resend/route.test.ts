import { createHmac, randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/resendWebhook", () => ({ handleResendReport: vi.fn() }));

import { handleResendReport } from "@/lib/resendWebhook";
import { POST } from "./route";

const secretBytes = randomBytes(24);
const secret = `whsec_${secretBytes.toString("base64")}`;

// Signs a body the way Resend (Svix) does: HMAC-SHA256 of "<id>.<timestamp>.<body>".
function signed(body: string, key: Buffer = secretBytes): Request {
    const id = "msg_1";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
    return new Request("https://example.com/api/webhooks/resend", {
        method: "POST",
        headers: { "svix-id": id, "svix-timestamp": timestamp, "svix-signature": `v1,${signature}` },
        body,
    });
}

const report = { type: "email.delivered", created_at: "2026-11-10T00:00:00Z", data: { email_id: "re_1" } };

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("RESEND_WEBHOOK_SECRET", secret);
    vi.stubEnv("RESEND_API_KEY", "re_test");
});

afterEach(() => {
    vi.unstubAllEnvs();
});

describe("POST /api/webhooks/resend", () => {
    it("hands a correctly signed report to the handler", async () => {
        const response = await POST(signed(JSON.stringify(report)));

        expect(response.status).toBe(200);
        expect(handleResendReport).toHaveBeenCalledWith(report);
    });

    it("refuses a report signed with another secret, without reading it", async () => {
        const response = await POST(signed(JSON.stringify(report), randomBytes(24)));

        expect(response.status).toBe(400);
        expect(handleResendReport).not.toHaveBeenCalled();
    });

    it("refuses an unsigned request", async () => {
        const response = await POST(new Request("https://example.com", { method: "POST", body: "{}" }));
        expect(response.status).toBe(400);
    });

    it("answers 503 when the secret isn't set", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        vi.stubEnv("RESEND_WEBHOOK_SECRET", "");

        expect((await POST(signed(JSON.stringify(report)))).status).toBe(503);
        expect(handleResendReport).not.toHaveBeenCalled();
    });

    it("answers 500 so Resend retries when the handler fails", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        vi.mocked(handleResendReport).mockRejectedValue(new Error("database down"));

        expect((await POST(signed(JSON.stringify(report)))).status).toBe(500);
    });
});
