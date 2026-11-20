import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/overdueReminders", () => ({ sendOverdueReminders: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({
    captureException: vi.fn(),
    captureCheckIn: vi.fn(),
    flush: vi.fn().mockResolvedValue(true),
}));

import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as Sentry from "@sentry/nextjs";
import { sendOverdueReminders } from "@/lib/overdueReminders";
import { GET } from "./route";

const secret = "s".repeat(32);
const call = (authorization?: string) =>
    GET(new Request("https://example.com/api/cron/reminders", { headers: authorization ? { authorization } : {} }));

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", secret);
    vi.mocked(sendOverdueReminders).mockResolvedValue({ sent: 2, skipped: 1, failed: [] });
    vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
    vi.unstubAllEnvs();
});

describe("GET /api/cron/reminders", () => {
    it("runs with Vercel's bearer secret, checks in and returns the counts", async () => {
        const response = await call(`Bearer ${secret}`);

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ sent: 2, skipped: 1, failed: 0 });
        expect(Sentry.captureCheckIn).toHaveBeenCalledWith(
            { monitorSlug: "reminders", status: "ok" },
            expect.objectContaining({ timezone: "UTC" }),
        );
        expect(Sentry.flush).toHaveBeenCalledWith(2000);
    });

    it("gives the monitor the schedule in vercel.json", async () => {
        await call(`Bearer ${secret}`);

        const vercel = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as {
            crons: { path: string; schedule: string }[];
        };
        const cron = vercel.crons.find((entry) => entry.path === "/api/cron/reminders");
        const config = vi.mocked(Sentry.captureCheckIn).mock.calls[0][1];
        expect(cron).toBeDefined();
        expect(config?.schedule).toEqual({ type: "crontab", value: cron?.schedule });
    });

    it.each([undefined, "Bearer wrong", secret])("refuses %j without running", async (auth) => {
        expect((await call(auth)).status).toBe(401);
        expect(sendOverdueReminders).not.toHaveBeenCalled();
        expect(Sentry.captureCheckIn).not.toHaveBeenCalled();
    });

    it("doesn't run at all without a secret configured", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        vi.stubEnv("CRON_SECRET", "");

        expect((await call("Bearer ")).status).toBe(503);
        expect(sendOverdueReminders).not.toHaveBeenCalled();
    });

    it("reports failed reminders to Sentry and answers 500", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        const error = new Error("Resend is down");
        vi.mocked(sendOverdueReminders).mockResolvedValue({ sent: 0, skipped: 0, failed: [{ workOrderId: "wo1", error }] });

        const response = await call(`Bearer ${secret}`);

        expect(response.status).toBe(500);
        expect(Sentry.captureException).toHaveBeenCalledWith(error, { tags: { reminderWorkOrder: "wo1" } });
        expect(Sentry.captureCheckIn).toHaveBeenCalledWith(
            { monitorSlug: "reminders", status: "error" },
            expect.anything(),
        );
    });

    it("checks in as failed when the whole run throws", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        vi.mocked(sendOverdueReminders).mockRejectedValue(new Error("database down"));

        expect((await call(`Bearer ${secret}`)).status).toBe(500);
        expect(Sentry.captureCheckIn).toHaveBeenCalledWith(
            { monitorSlug: "reminders", status: "error" },
            expect.anything(),
        );
    });
});
