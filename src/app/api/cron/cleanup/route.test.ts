import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/cleanup", () => ({ runCleanup: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import * as Sentry from "@sentry/nextjs";
import { runCleanup } from "@/lib/cleanup";
import { GET } from "./route";

const secret = "s".repeat(32);
const call = (authorization?: string) =>
    GET(new Request("https://example.com/api/cron/cleanup", { headers: authorization ? { authorization } : {} }));

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", secret);
    vi.mocked(runCleanup).mockResolvedValue({ done: { emailLogsDeleted: 3 }, failed: [] });
    vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
    vi.unstubAllEnvs();
});

describe("GET /api/cron/cleanup", () => {
    it("runs with Vercel's bearer secret and returns the counts", async () => {
        const response = await call(`Bearer ${secret}`);

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ done: { emailLogsDeleted: 3 }, failed: [] });
    });

    it.each([undefined, "Bearer wrong", secret, `Bearer ${secret}x`])("refuses %j without running", async (auth) => {
        expect((await call(auth)).status).toBe(401);
        expect(runCleanup).not.toHaveBeenCalled();
    });

    it("doesn't run at all without a secret configured", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        vi.stubEnv("CRON_SECRET", "");

        expect((await call("Bearer ")).status).toBe(503);
        expect(runCleanup).not.toHaveBeenCalled();
    });

    it("reports a failed task to Sentry and answers 500", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        const error = new Error("purge failed");
        vi.mocked(runCleanup).mockResolvedValue({ done: {}, failed: [{ task: "organizationsPurged", error }] });

        const response = await call(`Bearer ${secret}`);

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ done: {}, failed: ["organizationsPurged"] });
        expect(Sentry.captureException).toHaveBeenCalledWith(error, { tags: { cleanupTask: "organizationsPurged" } });
    });
});
