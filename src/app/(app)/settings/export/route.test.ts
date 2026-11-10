import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/rateLimit", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/rateLimit")>()),
    rateLimit: vi.fn(),
}));
vi.mock("@/lib/exportData", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/exportData")>()),
    buildExport: vi.fn(),
}));

import { getCurrentUser } from "@/lib/auth";
import { buildExport } from "@/lib/exportData";
import { rateLimit } from "@/lib/rateLimit";
import { GET } from "./route";

function signedInAs(role: "ADMIN" | "USER") {
    vi.mocked(getCurrentUser).mockResolvedValue({
        state: "ready",
        user: { id: "user1" },
        organization: { id: "org1", name: "Acme Property" },
        role,
    } as never);
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(rateLimit).mockResolvedValue({ ok: true, remaining: 4, retryAfterSeconds: 0 });
    vi.mocked(buildExport).mockResolvedValue([{ name: "README.txt", data: new TextEncoder().encode("hi") }]);
    vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("GET /settings/export", () => {
    it("streams the admin's organization as a ZIP download that isn't cached", async () => {
        signedInAs("ADMIN");

        const response = await GET();

        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Type")).toBe("application/zip");
        expect(response.headers.get("Content-Disposition")).toMatch(
            /^attachment; filename="praedium-export-acme-property-\d{4}-\d{2}-\d{2}\.zip"$/,
        );
        expect(response.headers.get("Cache-Control")).toBe("no-store");
        expect(buildExport).toHaveBeenCalledWith({ id: "org1", name: "Acme Property" }, expect.any(Date));
        expect(rateLimit).toHaveBeenCalledWith("export:org1", { limit: 5, windowSeconds: 3600 });
        // A ZIP starts with a local file header.
        expect(Buffer.from(await response.arrayBuffer()).readUInt32LE(0)).toBe(0x04034b50);
    });

    it("refuses a member who isn't an admin", async () => {
        signedInAs("USER");

        expect((await GET()).status).toBe(403);
        expect(buildExport).not.toHaveBeenCalled();
    });

    it("refuses when signed out", async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({ state: "signed-out" });

        expect((await GET()).status).toBe(401);
        expect(buildExport).not.toHaveBeenCalled();
    });

    it("refuses over the hourly limit, saying when to retry", async () => {
        signedInAs("ADMIN");
        vi.mocked(rateLimit).mockResolvedValue({ ok: false, remaining: 0, retryAfterSeconds: 1200 });

        const response = await GET();

        expect(response.status).toBe(429);
        expect(response.headers.get("Retry-After")).toBe("1200");
        expect(buildExport).not.toHaveBeenCalled();
    });
});
