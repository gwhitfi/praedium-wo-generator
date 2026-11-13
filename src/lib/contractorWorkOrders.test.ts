import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
    default: {
        workOrder: { findUnique: vi.fn(), findMany: vi.fn() },
    },
}));

import prisma from "@/lib/prisma";
import {
    canLookup,
    countContractorWorkOrders,
    getContractorWorkOrder,
    listContractorWorkOrders,
    maskEmail,
    normalizeEmail,
    summaryAreas,
    type ContractorWorkOrder,
} from "./contractorWorkOrders";

function workOrder(overrides: Partial<ContractorWorkOrder> = {}): ContractorWorkOrder {
    return {
        id: "wo1",
        organizationId: "org1",
        status: "SENT",
        archived: false,
        contractorEmail: "sam@example.com",
        organization: { name: "Acme" },
        ...overrides,
    } as ContractorWorkOrder;
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("getContractorWorkOrder", () => {
    it("looks the work order up by its token with the organization's name", async () => {
        vi.mocked(prisma.workOrder.findUnique).mockResolvedValue(workOrder() as never);
        await getContractorWorkOrder("tok");
        expect(prisma.workOrder.findUnique).toHaveBeenCalledWith({
            where: { publicToken: "tok", organization: { deletedAt: null } },
            include: { organization: { select: { name: true } } },
        });
    });

    it("returns null when the work order is missing or its organization is locked for deletion", async () => {
        // The query only matches a live organization, so a locked one comes back as no row.
        vi.mocked(prisma.workOrder.findUnique).mockResolvedValue(null);
        expect(await getContractorWorkOrder("tok")).toBeNull();
    });

    it("returns null when the work order is archived, a draft or cancelled", async () => {
        for (const row of [
            workOrder({ archived: true }),
            workOrder({ status: "DRAFT" }),
            workOrder({ status: "CANCELLED" }),
        ]) {
            vi.mocked(prisma.workOrder.findUnique).mockResolvedValue(row as never);
            expect(await getContractorWorkOrder("tok")).toBeNull();
        }
    });

    it("returns sent, completed and closed work orders", async () => {
        for (const status of ["SENT", "COMPLETED", "CLOSED"] as const) {
            const row = workOrder({ status });
            vi.mocked(prisma.workOrder.findUnique).mockResolvedValue(row as never);
            expect(await getContractorWorkOrder("tok")).toBe(row);
        }
    });
});

describe("normalizeEmail", () => {
    it("trims and lower-cases", () => {
        expect(normalizeEmail("  Sam@Example.COM ")).toBe("sam@example.com");
    });
});

describe("canLookup", () => {
    it("allows current work orders with a contractor email", () => {
        for (const status of ["SENT", "IN_PROGRESS", "COMPLETED"] as const) {
            expect(canLookup(workOrder({ status }))).toBe(true);
        }
    });

    it("refuses closed work orders and ones without a contractor email", () => {
        expect(canLookup(workOrder({ status: "CLOSED" }))).toBe(false);
        expect(canLookup(workOrder({ contractorEmail: null }))).toBe(false);
    });
});

describe("maskEmail", () => {
    it("keeps the first character and the domain", () => {
        expect(maskEmail("Joe@JoesPlumbing.com")).toBe("j•••@joesplumbing.com");
        expect(maskEmail(" a@b.co ")).toBe("a•••@b.co");
    });

    it("hides everything when there's no local part", () => {
        expect(maskEmail("@example.com")).toBe("•••");
        expect(maskEmail("nonsense")).toBe("•••");
    });
});

describe("summaryAreas", () => {
    const areas = [
        {
            id: "a1",
            name: "Kitchen",
            lineItems: [
                {
                    id: "li1",
                    description: "Replace faucet",
                    priority: "HIGH",
                    completed: true,
                    contractorNotes: "Gate code 1234",
                    attachments: [{ id: "ph1" }],
                },
                {
                    id: "li2",
                    description: "Fix drawer",
                    priority: "LOW",
                    completed: false,
                    contractorNotes: null,
                    attachments: [],
                },
            ],
        },
    ];

    it("drops contractor notes and photo ids and keeps everything else", () => {
        expect(summaryAreas(areas)).toEqual([
            {
                id: "a1",
                name: "Kitchen",
                lineItems: [
                    {
                        id: "li1",
                        description: "Replace faucet",
                        priority: "HIGH",
                        completed: true,
                        contractorNotes: null,
                        attachments: [],
                    },
                    {
                        id: "li2",
                        description: "Fix drawer",
                        priority: "LOW",
                        completed: false,
                        contractorNotes: null,
                        attachments: [],
                    },
                ],
            },
        ]);
    });

    it("doesn't change the input", () => {
        summaryAreas(areas);
        expect(areas[0].lineItems[0].contractorNotes).toBe("Gate code 1234");
        expect(areas[0].lineItems[0].attachments).toEqual([{ id: "ph1" }]);
    });
});

describe("listContractorWorkOrders", () => {
    it("returns nothing without querying when the work order has no contractor email", async () => {
        expect(await listContractorWorkOrders(workOrder({ contractorEmail: null }))).toEqual([]);
        expect(prisma.workOrder.findMany).not.toHaveBeenCalled();
    });

    it("returns nothing without querying from a closed work order", async () => {
        expect(await listContractorWorkOrders(workOrder({ status: "CLOSED" }))).toEqual([]);
        expect(prisma.workOrder.findMany).not.toHaveBeenCalled();
    });

    it("queries the organization's current work orders, only while the organization isn't locked", async () => {
        vi.mocked(prisma.workOrder.findMany).mockResolvedValue([] as never);

        await listContractorWorkOrders(workOrder({ contractorEmail: "  Sam@Example.com " }));

        expect(prisma.workOrder.findMany).toHaveBeenCalledWith({
            where: {
                organizationId: "org1",
                organization: { deletedAt: null },
                archived: false,
                status: { in: ["SENT", "IN_PROGRESS", "COMPLETED"] },
                contractorEmail: { not: null },
            },
            orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
            include: { property: true, unit: true },
        });
    });

    it("keeps only rows whose email matches exactly after normalising, in query order", async () => {
        const rows = [
            { id: "padded", contractorEmail: "  Sam_Smith@Example.com " },
            { id: "underscore-wildcard", contractorEmail: "samXsmith@example.com" },
            { id: "other", contractorEmail: "sam_smith@example.org" },
            { id: "none", contractorEmail: null },
            { id: "exact", contractorEmail: "sam_smith@example.com" },
        ];
        vi.mocked(prisma.workOrder.findMany).mockResolvedValue(rows as never);

        const result = await listContractorWorkOrders(workOrder({ contractorEmail: "sam_smith@example.com" }));

        expect(result.map((row) => row.id)).toEqual(["padded", "exact"]);
    });
});

describe("countContractorWorkOrders", () => {
    it("returns 0 without querying from a closed work order or one without an email", async () => {
        expect(await countContractorWorkOrders(workOrder({ status: "CLOSED" }))).toBe(0);
        expect(await countContractorWorkOrders(workOrder({ contractorEmail: null }))).toBe(0);
        expect(prisma.workOrder.findMany).not.toHaveBeenCalled();
    });

    it("counts the other current work orders whose email matches exactly after normalising", async () => {
        vi.mocked(prisma.workOrder.findMany).mockResolvedValue([
            { contractorEmail: " Sam_Smith@Example.com" },
            { contractorEmail: "samXsmith@example.com" },
            { contractorEmail: "sam_smith@example.com" },
        ] as never);

        expect(await countContractorWorkOrders(workOrder({ contractorEmail: "sam_smith@example.com" }))).toBe(2);
        expect(prisma.workOrder.findMany).toHaveBeenCalledWith({
            where: {
                organizationId: "org1",
                organization: { deletedAt: null },
                id: { not: "wo1" },
                archived: false,
                status: { in: ["SENT", "IN_PROGRESS", "COMPLETED"] },
                contractorEmail: { not: null },
            },
            select: { contractorEmail: true },
        });
    });
});
