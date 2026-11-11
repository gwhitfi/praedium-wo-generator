import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
    default: {
        lineItem: { findFirst: vi.fn() },
        attachment: { count: vi.fn(), findFirst: vi.fn(), deleteMany: vi.fn() },
        $transaction: vi.fn(),
    },
}));
vi.mock("@/lib/storage", () => ({ deleteFiles: vi.fn(), lineItemPhotoKey: vi.fn(), uploadFile: vi.fn() }));
vi.mock("@/lib/workOrderEvents", () => ({ logEvent: vi.fn() }));
vi.mock("@/lib/photos", () => ({
    checkPhoto: vi.fn(() => ({ ok: true, type: { mimeType: "image/jpeg" } })),
    MAX_PHOTO_BYTES: 3 * 1024 * 1024,
    MAX_LINE_ITEM_PHOTOS: 3,
}));

import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { deleteFiles, lineItemPhotoKey, uploadFile } from "@/lib/storage";
import { logEvent } from "@/lib/workOrderEvents";
import { addLineItemPhoto, removeLineItemPhoto } from "./photoActions";

const user = { id: "user1", firstName: "Justin", lastName: "Whitfield", email: "justin@example.com" };
const office = { kind: "office", user };
const ids = { workOrderId: "wo1", organizationId: "org1" };
const workOrder = {
    id: "wo1",
    organizationId: "org1",
    publicToken: "token1",
    status: "DRAFT",
    archived: false,
};

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({
        state: "ready",
        user,
        organization: { id: "org1", name: "Acme Property", email: null, phone: null },
    } as never);
});

describe("line item photos", () => {
    const tx = { attachment: { count: vi.fn(), create: vi.fn() }, $queryRaw: vi.fn() };
    const detail = { item: "Replace faucet", area: "Kitchen" };
    const faucet = (status: string, archived = false) => ({
        id: "li1",
        description: "Replace faucet",
        area: { name: "Kitchen", workOrder: { ...workOrder, status, archived } },
    });
    const photoForm = () => {
        const form = new FormData();
        form.set("photo", new File([new Uint8Array([1, 2, 3])], "faucet.jpg"));
        return form;
    };

    beforeEach(() => {
        vi.mocked(prisma.lineItem.findFirst).mockResolvedValue(faucet("SENT") as never);
        vi.mocked(prisma.$transaction).mockImplementation((async (fn: (tx: unknown) => unknown) => fn(tx)) as never);
        vi.mocked(lineItemPhotoKey).mockReturnValue("new-key");
        vi.mocked(prisma.attachment.count).mockResolvedValue(1);
        tx.attachment.count.mockResolvedValue(1);
        vi.mocked(prisma.attachment.findFirst).mockResolvedValue({
            id: "ph1",
            lineItemId: "li1",
            storageKey: "old-key",
        } as never);
        vi.mocked(prisma.attachment.deleteMany).mockResolvedValue({ count: 1 });
    });

    describe("addLineItemPhoto", () => {
        it("adds the photo next to the existing ones and logs it with its item and area", async () => {
            expect(await addLineItemPhoto("li1", photoForm())).toEqual({ ok: true });

            expect(tx.$queryRaw).toHaveBeenCalled();
            expect(tx.attachment.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    lineItemId: "li1",
                    organizationId: "org1",
                    storageKey: "new-key",
                    sortOrder: 1,
                }),
            });
            expect(deleteFiles).not.toHaveBeenCalled();
            expect(logEvent).toHaveBeenCalledWith({ ...ids, type: "PHOTO_ADDED", actor: office, detail });
        });

        it("refuses a 4th photo before uploading", async () => {
            vi.mocked(prisma.attachment.count).mockResolvedValue(3);

            expect(await addLineItemPhoto("li1", photoForm())).toEqual({
                ok: false,
                error: "A line item can have up to 3 photos.",
            });
            expect(uploadFile).not.toHaveBeenCalled();
            expect(logEvent).not.toHaveBeenCalled();
        });

        it("deletes the uploaded file when the item filled up during the upload", async () => {
            tx.attachment.count.mockResolvedValue(3);

            expect(await addLineItemPhoto("li1", photoForm())).toEqual({
                ok: false,
                error: "A line item can have up to 3 photos.",
            });
            expect(tx.attachment.create).not.toHaveBeenCalled();
            expect(deleteFiles).toHaveBeenCalledWith(["new-key"]);
            expect(logEvent).not.toHaveBeenCalled();
        });

        it("refuses a closed work order", async () => {
            vi.mocked(prisma.lineItem.findFirst).mockResolvedValue(faucet("COMPLETED") as never);

            expect(await addLineItemPhoto("li1", photoForm())).toEqual({
                ok: false,
                error: "Photos can only be changed on open work orders.",
            });
            expect(uploadFile).not.toHaveBeenCalled();
        });
    });

    describe("removeLineItemPhoto", () => {
        it("removes only that photo and its file, and logs it", async () => {
            expect(await removeLineItemPhoto("ph1")).toEqual({ ok: true });

            expect(prisma.attachment.findFirst).toHaveBeenCalledWith(
                expect.objectContaining({ where: { id: "ph1", organizationId: "org1", lineItemId: { not: null } } }),
            );
            expect(prisma.attachment.deleteMany).toHaveBeenCalledWith({ where: { id: "ph1", organizationId: "org1" } });
            expect(deleteFiles).toHaveBeenCalledWith(["old-key"]);
            expect(logEvent).toHaveBeenCalledWith({ ...ids, type: "PHOTO_REMOVED", actor: office, detail });
        });

        it("refuses another organization's photo", async () => {
            vi.mocked(prisma.attachment.findFirst).mockResolvedValue(null);

            expect(await removeLineItemPhoto("ph1")).toEqual({ ok: false, error: "Photo not found." });
            expect(prisma.attachment.deleteMany).not.toHaveBeenCalled();
            expect(deleteFiles).not.toHaveBeenCalled();
        });

        it.each([
            ["closed", faucet("CLOSED")],
            ["archived", faucet("SENT", true)],
        ])("refuses a photo on a %s work order", async (_, lineItem) => {
            vi.mocked(prisma.lineItem.findFirst).mockResolvedValue(lineItem as never);

            expect(await removeLineItemPhoto("ph1")).toEqual({
                ok: false,
                error: "Photos can only be changed on open work orders.",
            });
            expect(prisma.attachment.deleteMany).not.toHaveBeenCalled();
            expect(deleteFiles).not.toHaveBeenCalled();
        });

        it("doesn't log or delete files when the photo was already gone", async () => {
            vi.mocked(prisma.attachment.deleteMany).mockResolvedValue({ count: 0 });

            expect(await removeLineItemPhoto("ph1")).toEqual({ ok: true });
            expect(deleteFiles).not.toHaveBeenCalled();
            expect(logEvent).not.toHaveBeenCalled();
        });
    });
});
