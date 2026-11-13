import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ default: { attachment: { findFirst: vi.fn() } } }));
vi.mock("@/lib/contractorAccess", () => ({ isVerifiedFor: vi.fn() }));
vi.mock("@/lib/servePhoto", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/servePhoto")>()),
    servePhoto: vi.fn(),
}));

import { isVerifiedFor } from "@/lib/contractorAccess";
import prisma from "@/lib/prisma";
import { servePhoto } from "@/lib/servePhoto";
import { GET } from "./route";

const request = new Request("https://praedium.test/wo/token1/photos/ph1");
const params = (token = "token1", id = "ph1") => ({ params: Promise.resolve({ token, id }) });

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isVerifiedFor).mockResolvedValue(true);
    vi.mocked(servePhoto).mockResolvedValue(new Response("photo"));
});

describe("GET /wo/[token]/photos/[id]", () => {
    it("serves a photo of the token's open work order", async () => {
        vi.mocked(prisma.attachment.findFirst).mockResolvedValue({
            storageKey: "key1",
            lineItem: { area: { workOrder: { contractorEmail: "sam@example.com", status: "SENT" } } },
        } as never);

        const response = await GET(request, params());

        expect(await response.text()).toBe("photo");
        expect(servePhoto).toHaveBeenCalledWith("key1", request);
    });

    it("looks the photo up only under a live organization, so a locked one's photos are not found", async () => {
        vi.mocked(prisma.attachment.findFirst).mockResolvedValue(null);

        const response = await GET(request, params());

        expect(response.status).toBe(404);
        expect(servePhoto).not.toHaveBeenCalled();
        expect(prisma.attachment.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    id: "ph1",
                    lineItem: {
                        area: {
                            workOrder: {
                                publicToken: "token1",
                                organization: { deletedAt: null },
                                archived: false,
                                inHouse: false,
                                status: { notIn: ["DRAFT", "CANCELLED"] },
                            },
                        },
                    },
                },
            }),
        );
    });
});
