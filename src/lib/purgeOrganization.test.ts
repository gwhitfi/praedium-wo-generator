import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = {
    user: { findMany: vi.fn(), update: vi.fn() },
    workOrder: { deleteMany: vi.fn() },
    organization: { delete: vi.fn() },
};

vi.mock("@/lib/prisma", () => ({
    default: { $transaction: vi.fn((run: (client: typeof tx) => unknown) => run(tx)) },
}));
vi.mock("@/lib/attachments", () => ({ attachmentKeys: vi.fn() }));
vi.mock("@/lib/storage", () => ({ deleteFiles: vi.fn() }));

import { attachmentKeys } from "@/lib/attachments";
import { deleteFiles } from "@/lib/storage";
import { purgeOrganization } from "./purgeOrganization";

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(attachmentKeys).mockResolvedValue(["org/org1/a.jpg", "org/org1/b.jpg"]);
    tx.user.findMany.mockResolvedValue([]);
    tx.workOrder.deleteMany.mockResolvedValue({ count: 3 });
});

describe("purgeOrganization", () => {
    it("deletes the work orders, then the organization, then the stored photos", async () => {
        expect(await purgeOrganization("org1")).toEqual({ workOrders: 3, files: 2 });

        expect(attachmentKeys).toHaveBeenCalledWith("org1", {});
        expect(tx.workOrder.deleteMany).toHaveBeenCalledWith({ where: { organizationId: "org1" } });
        expect(tx.organization.delete).toHaveBeenCalledWith({ where: { id: "org1" } });
        expect(tx.workOrder.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
            tx.organization.delete.mock.invocationCallOrder[0],
        );
        expect(deleteFiles).toHaveBeenCalledWith(["org/org1/a.jpg", "org/org1/b.jpg"]);
    });

    it("keeps users who belong to other organizations by pointing them at one of those first", async () => {
        tx.user.findMany.mockResolvedValue([
            { id: "user1", memberships: [{ organizationId: "org2" }] },
            { id: "user2", memberships: [] },
        ]);

        await purgeOrganization("org1");

        expect(tx.user.update).toHaveBeenCalledOnce();
        expect(tx.user.update).toHaveBeenCalledWith({ where: { id: "user1" }, data: { organizationId: "org2" } });
        expect(tx.user.update.mock.invocationCallOrder[0]).toBeLessThan(
            tx.organization.delete.mock.invocationCallOrder[0],
        );
    });

    it("leaves the stored photos alone when the database delete fails", async () => {
        tx.organization.delete.mockRejectedValueOnce(new Error("database down"));

        await expect(purgeOrganization("org1")).rejects.toThrow("database down");
        expect(deleteFiles).not.toHaveBeenCalled();
    });

    it("deletes many photos in batches", async () => {
        vi.mocked(attachmentKeys).mockResolvedValue(Array.from({ length: 1201 }, (_, i) => `k${i}`));

        await purgeOrganization("org1");

        expect(vi.mocked(deleteFiles).mock.calls.map((call) => call[0].length)).toEqual([500, 500, 201]);
    });
});
