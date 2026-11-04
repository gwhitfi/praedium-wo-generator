import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
    default: {
        property: { findMany: vi.fn() },
        contact: { findMany: vi.fn() },
    },
}));

import prisma from "@/lib/prisma";
import { searchContractors, searchProperties } from "./tools";

const joes = {
    id: "joes",
    displayName: "Joe's Plumbing",
    firstName: "Joe",
    lastName: "Smith",
    company: "Joe's Plumbing",
};
const ace = { id: "ace", displayName: "Ace Electric", firstName: "Ann", lastName: "Lee", company: "Ace Electric LLC" };

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.contact.findMany).mockResolvedValue([joes, ace] as never);
    vi.mocked(prisma.property.findMany).mockResolvedValue([] as never);
});

describe("searchContractors", () => {
    it("returns a compact match from the organization's contractors", async () => {
        await expect(searchContractors("org1", "Joe's Plumbing")).resolves.toEqual({
            status: "matched",
            match: { id: "joes", displayName: "Joe's Plumbing", company: "Joe's Plumbing" },
        });
        expect(vi.mocked(prisma.contact.findMany).mock.calls[0][0]).toMatchObject({
            where: { organizationId: "org1", archived: false },
        });
    });

    it("returns notFound when nothing is close", async () => {
        await expect(searchContractors("org1", "Zebra Roofing")).resolves.toEqual({ status: "notFound" });
    });
});

describe("searchProperties", () => {
    it("searches the organization's properties", async () => {
        await expect(searchProperties("org1", "123 Maple St")).resolves.toEqual({ status: "notFound" });
        expect(vi.mocked(prisma.property.findMany).mock.calls[0][0]).toMatchObject({
            where: { organizationId: "org1", archived: false },
        });
    });
});
