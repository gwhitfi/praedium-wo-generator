import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
    default: {
        property: { findMany: vi.fn() },
    },
}));

import prisma from "@/lib/prisma";
import { searchProperties } from "./tools";

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.property.findMany).mockResolvedValue([] as never);
});

describe("searchProperties", () => {
    it("searches the organization's properties", async () => {
        await expect(searchProperties("org1", "123 Maple St")).resolves.toEqual({ status: "notFound" });
        expect(vi.mocked(prisma.property.findMany).mock.calls[0][0]).toMatchObject({
            where: { organizationId: "org1", archived: false },
        });
    });
});
