import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
    default: {
        property: { findMany: vi.fn() },
        unit: { findMany: vi.fn() },
        contact: { findMany: vi.fn() },
        workOrder: { findMany: vi.fn() },
        lineItem: { findMany: vi.fn() },
        workOrderEvent: { findMany: vi.fn() },
        emailLog: { findMany: vi.fn() },
    },
}));

import prisma from "@/lib/prisma";
import { buildExport, exportFileName } from "./exportData";

const organization = { id: "org1", name: "Acme Property" };
const created = new Date("2026-11-01T12:00:00Z");

const files = (entries: { name: string; data: Uint8Array }[]) =>
    Object.fromEntries(entries.map((entry) => [entry.name, new TextDecoder().decode(entry.data)]));

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.property.findMany).mockResolvedValue([
        {
            id: "p1",
            displayName: "Maple Duplex",
            propertyType: "DUPLEX",
            addressLine1: "12 Oak St",
            addressLine2: null,
            city: "Greenville",
            state: "SC",
            zipCode: "29601",
            notes: "=cmd()",
            favorite: false,
            archived: false,
            createdAt: created,
        },
    ] as never);
    vi.mocked(prisma.unit.findMany).mockResolvedValue([]);
    vi.mocked(prisma.contact.findMany).mockResolvedValue([]);
    vi.mocked(prisma.workOrder.findMany).mockResolvedValue([
        {
            id: "wo1",
            jobNumber: "2026-1001",
            title: "Fix sink",
            status: "SENT",
            property: { displayName: "Maple Duplex" },
            unit: null,
            dueDate: new Date("2026-11-20T00:00:00Z"),
            createdAt: created,
        },
    ] as never);
    vi.mocked(prisma.lineItem.findMany).mockResolvedValue([
        {
            id: "li1",
            description: "Replace faucet",
            priority: "HIGH",
            completed: false,
            completedAt: null,
            contractorNotes: null,
            area: { name: "Kitchen", workOrder: { id: "wo1", jobNumber: "2026-1001" } },
            attachments: [
                { id: "a1", fileName: "faucet.jpg" },
                { id: "a2", fileName: null },
            ],
        },
    ] as never);
    vi.mocked(prisma.workOrderEvent.findMany).mockResolvedValue([
        {
            id: "e1",
            type: "SENT",
            createdAt: created,
            actorName: "Justin W.",
            byContractor: false,
            detail: { deliveryMethod: "EMAIL", resent: false },
            workOrder: { jobNumber: "2026-1001" },
        },
    ] as never);
    vi.mocked(prisma.emailLog.findMany).mockResolvedValue([]);
});

describe("buildExport", () => {
    it("reads only the organization's rows, leaving out link tokens and Resend ids", async () => {
        await buildExport(organization);

        for (const model of ["property", "unit", "contact", "workOrder", "workOrderEvent", "emailLog"] as const) {
            expect(vi.mocked(prisma[model].findMany).mock.calls[0][0]).toMatchObject({
                where: { organizationId: "org1" },
            });
        }
        expect(vi.mocked(prisma.lineItem.findMany).mock.calls[0][0]).toMatchObject({
            where: { area: { workOrder: { organizationId: "org1" } } },
        });
        expect(vi.mocked(prisma.workOrder.findMany).mock.calls[0][0]).toMatchObject({ omit: { publicToken: true } });
        expect(vi.mocked(prisma.emailLog.findMany).mock.calls[0][0]).toMatchObject({ omit: { resendId: true } });
    });

    it("writes the README, every CSV and data.json", async () => {
        const out = files(await buildExport(organization, created));

        expect(Object.keys(out)).toEqual([
            "README.txt",
            "properties.csv",
            "units.csv",
            "contacts.csv",
            "work_orders.csv",
            "line_items.csv",
            "activity.csv",
            "emails.csv",
            "data.json",
        ]);
        expect(out["README.txt"]).toContain("Praedium data export for Acme Property");
        expect(out["properties.csv"]).toContain("'=cmd()");
        expect(out["work_orders.csv"]).toContain("2026-1001,Fix sink,SENT,Maple Duplex");
        expect(out["work_orders.csv"]).toContain("2026-11-20");
        expect(out["line_items.csv"]).toContain("Kitchen,Replace faucet,HIGH,false,,,faucet.jpg; a2");
        expect(out["activity.csv"]).toContain("Justin W. sent it by email");

        const data = JSON.parse(out["data.json"]);
        expect(data.organization).toBe("Acme Property");
        expect(data.workOrders[0]).not.toHaveProperty("property");
        expect(data.lineItems[0]).toMatchObject({ area: "Kitchen", workOrderId: "wo1", photos: ["faucet.jpg", "a2"] });
        expect(data.activity[0]).toMatchObject({ jobNumber: "2026-1001", text: "Justin W. sent it by email" });
    });
});

describe("exportFileName", () => {
    it("makes a safe, dated file name from the organization's name", () => {
        expect(exportFileName('Acme "Rentals" & Co.', created)).toBe("praedium-export-acme-rentals-co-2026-11-01.zip");
        expect(exportFileName("Résidences Côté", created)).toBe("praedium-export-residences-cote-2026-11-01.zip");
        expect(exportFileName("!!!", created)).toBe("praedium-export-organization-2026-11-01.zip");
    });
});
