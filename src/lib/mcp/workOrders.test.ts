import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
    default: {
        workOrder: { findMany: vi.fn(), findFirst: vi.fn() },
        workOrderEvent: { findMany: vi.fn() },
    },
}));

import prisma from "@/lib/prisma";
import { getWorkOrder, listWorkOrders } from "./workOrders";

const created = new Date("2026-11-03T15:00:00Z");

const workOrder = {
    id: "wo1",
    jobNumber: "2026-1001",
    status: "SENT",
    archived: false,
    title: "Fix leak",
    notes: "Gate code 1234",
    dueDate: new Date("2026-11-20T00:00:00Z"),
    deliveryMethod: "EMAIL",
    notifyTenant: true,
    createdAt: created,
    updatedAt: created,
    sentAt: created,
    completedAt: null,
    closedAt: null,
    cancelledAt: null,
    cancelReason: null,
    completionNotes: null,
    contractorId: "joes",
    contractorName: "Joe's Plumbing",
    contractorPhone: "8645550100",
    contractorEmail: "joe@example.com",
    tenantId: null,
    tenantName: null,
    tenantPhone: null,
    tenantEmail: null,
    property: {
        id: "prop1",
        displayName: "Maple Duplex",
        addressLine1: "123 Maple St",
        addressLine2: null,
        city: "Greenville",
        state: "SC",
        zipCode: "29601",
    },
    unit: { id: "unit1", name: "A" },
    areas: [
        {
            name: "Kitchen",
            lineItems: [
                {
                    id: "li1",
                    description: "Replace trap",
                    priority: "HIGH",
                    completed: false,
                    completedAt: null,
                    contractorNotes: null,
                },
            ],
        },
    ],
};

beforeEach(() => {
    vi.clearAllMocks();
});

describe("listWorkOrders", () => {
    it("lists the organization's non-archived work orders, newest first, as compact rows", async () => {
        vi.mocked(prisma.workOrder.findMany).mockResolvedValue([
            { ...workOrder, property: { displayName: "Maple Duplex" }, unit: { name: "A" } },
            {
                ...workOrder,
                id: "wo2",
                dueDate: null,
                contractorName: null,
                unit: null,
                property: { displayName: "Oak" },
            },
        ] as never);

        await expect(listWorkOrders("org1", { limit: 20 })).resolves.toEqual([
            {
                id: "wo1",
                jobNumber: "2026-1001",
                status: "SENT",
                title: "Fix leak",
                property: "Maple Duplex",
                unit: "Unit A",
                contractor: "Joe's Plumbing",
                dueDate: "2026-11-20",
                createdAt: created.toISOString(),
                updatedAt: created.toISOString(),
            },
            expect.objectContaining({ id: "wo2", property: "Oak", unit: null, contractor: null, dueDate: null }),
        ]);
        expect(vi.mocked(prisma.workOrder.findMany).mock.calls[0][0]).toMatchObject({
            where: { organizationId: "org1", archived: false },
            orderBy: { createdAt: "desc" },
            take: 20,
        });
    });

    it("applies the status, property and text filters", async () => {
        vi.mocked(prisma.workOrder.findMany).mockResolvedValue([]);
        await listWorkOrders("org1", { status: "DRAFT", propertyId: "prop1", query: "1001", limit: 5 });
        expect(vi.mocked(prisma.workOrder.findMany).mock.calls[0][0]).toMatchObject({
            where: {
                organizationId: "org1",
                archived: false,
                status: "DRAFT",
                propertyId: "prop1",
                OR: [
                    { title: { contains: "1001", mode: "insensitive" } },
                    { jobNumber: { contains: "1001", mode: "insensitive" } },
                ],
            },
            take: 5,
        });
    });
});

describe("getWorkOrder", () => {
    it("returns null, without loading history, when the work order isn't in the organization", async () => {
        vi.mocked(prisma.workOrder.findFirst).mockResolvedValue(null);
        await expect(getWorkOrder("org1", "wo1")).resolves.toBeNull();
        expect(vi.mocked(prisma.workOrder.findFirst).mock.calls[0][0]).toMatchObject({
            where: { id: "wo1", organizationId: "org1" },
        });
        expect(prisma.workOrderEvent.findMany).not.toHaveBeenCalled();
    });

    it("returns the detail with contact snapshots, areas and worded activity", async () => {
        vi.mocked(prisma.workOrder.findFirst).mockResolvedValue(workOrder as never);
        vi.mocked(prisma.workOrderEvent.findMany).mockResolvedValue([
            {
                type: "CREATED",
                createdAt: created,
                actorName: "Justin W.",
                byContractor: false,
                detail: { source: "mcp" },
            },
        ] as never);

        const detail = await getWorkOrder("org1", "wo1");

        expect(detail).toMatchObject({
            id: "wo1",
            notes: "Gate code 1234",
            dueDate: "2026-11-20",
            sentAt: created.toISOString(),
            completedAt: null,
            property: { id: "prop1", name: "Maple Duplex", city: "Greenville" },
            unit: { id: "unit1", label: "Unit A" },
            contractor: { id: "joes", name: "Joe's Plumbing", phone: "8645550100", email: "joe@example.com" },
            tenant: null,
            areas: [{ name: "Kitchen", lineItems: [{ id: "li1", description: "Replace trap", priority: "HIGH" }] }],
            activity: [
                {
                    type: "CREATED",
                    text: "Justin W. created the work order through the API",
                    createdAt: created.toISOString(),
                },
            ],
        });
        expect(vi.mocked(prisma.workOrderEvent.findMany).mock.calls[0][0]).toMatchObject({
            where: { workOrderId: "wo1", organizationId: "org1" },
            orderBy: { createdAt: "desc" },
        });
    });
});
