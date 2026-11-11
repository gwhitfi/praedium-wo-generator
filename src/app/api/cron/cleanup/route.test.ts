import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/cleanup", () => ({ runCleanup: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({
    captureException: vi.fn(),
    captureCheckIn: vi.fn(),
    flush: vi.fn().mockResolvedValue(true),
}));

import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as Sentry from "@sentry/nextjs";
import { runCleanup } from "@/lib/cleanup";
import { GET } from "./route";

const monitorConfig = {
    schedule: { type: "crontab", value: "0 8 * * *" },
    timezone: "UTC",
    checkinMargin: 90,
    failureIssueThreshold: 1,
    recoveryThreshold: 1,
};

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

    it("checks in with Sentry and waits for delivery before answering", async () => {
        let delivered = false;
        vi.mocked(Sentry.flush).mockImplementationOnce(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
            delivered = true;
            return true;
        });

        await call(`Bearer ${secret}`);

        expect(Sentry.captureCheckIn).toHaveBeenCalledTimes(1);
        expect(Sentry.captureCheckIn).toHaveBeenCalledWith({ monitorSlug: "cleanup", status: "ok" }, monitorConfig);
        expect(Sentry.flush).toHaveBeenCalledWith(2000);
        expect(vi.mocked(Sentry.flush).mock.invocationCallOrder[0]).toBeGreaterThan(
            vi.mocked(Sentry.captureCheckIn).mock.invocationCallOrder[0],
        );
        expect(delivered).toBe(true);
    });

    it("gives the monitor the schedule in vercel.json", async () => {
        await call(`Bearer ${secret}`);

        const vercel = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as {
            crons: { path: string; schedule: string }[];
        };
        const cron = vercel.crons.find((entry) => entry.path === "/api/cron/cleanup");
        const config = vi.mocked(Sentry.captureCheckIn).mock.calls[0][1];
        expect(cron).toBeDefined();
        expect(config?.schedule).toEqual({ type: "crontab", value: cron?.schedule });
    });

    it.each([undefined, "Bearer wrong", secret, `Bearer ${secret}x`])("refuses %j without running", async (auth) => {
        expect((await call(auth)).status).toBe(401);
        expect(runCleanup).not.toHaveBeenCalled();
        expect(Sentry.captureCheckIn).not.toHaveBeenCalled();
    });

    it("doesn't run at all without a secret configured", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        vi.stubEnv("CRON_SECRET", "");

        expect((await call("Bearer ")).status).toBe(503);
        expect(runCleanup).not.toHaveBeenCalled();
        expect(Sentry.captureCheckIn).not.toHaveBeenCalled();
    });

    it("reports a failed task to Sentry and answers 500", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        const error = new Error("purge failed");
        vi.mocked(runCleanup).mockResolvedValue({ done: {}, failed: [{ task: "organizationsPurged", error }] });

        const response = await call(`Bearer ${secret}`);

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ done: {}, failed: ["organizationsPurged"] });
        expect(Sentry.captureException).toHaveBeenCalledWith(error, { tags: { cleanupTask: "organizationsPurged" } });
        expect(Sentry.captureCheckIn).toHaveBeenCalledWith({ monitorSlug: "cleanup", status: "error" }, monitorConfig);
        expect(Sentry.flush).toHaveBeenCalledWith(2000);
    });
});
