import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ default: { $queryRaw: vi.fn() } }));

import prisma from "@/lib/prisma";
import { GET } from "./route";

beforeEach(() => {
    vi.clearAllMocks();
});

describe("GET /api/health", () => {
    it("is 200 when the database answers, and isn't cached", async () => {
        vi.mocked(prisma.$queryRaw).mockResolvedValue([{ "?column?": 1 }] as never);

        const response = await GET();

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ ok: true });
        expect(response.headers.get("Cache-Control")).toBe("no-store");
    });

    it("is 503 without details when the database is unreachable", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.1:5432"));

        const response = await GET();

        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ ok: false });
        expect(response.headers.get("Cache-Control")).toBe("no-store");
    });
});
