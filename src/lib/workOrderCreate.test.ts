import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
    default: {
        property: { findFirst: vi.fn() },
        unit: { findFirst: vi.fn() },
        contact: { findFirst: vi.fn() },
        $transaction: vi.fn(),
    },
}));
vi.mock("@/lib/dates", () => ({ todayInAppTimeZone: vi.fn(() => new Date("2026-11-03")) }));
vi.mock("@/lib/workOrderEvents", () => ({ logEvent: vi.fn() }));

import prisma from "@/lib/prisma";
import { logEvent, type Actor } from "@/lib/workOrderEvents";
import type { ParsedConfirmedDraft } from "@/lib/workOrderConfirmed";
import { createDraftWorkOrder } from "./workOrderCreate";

const draft: ParsedConfirmedDraft = {
    propertyId: "prop1",
    unitId: "unit1",
    contractorId: "joes",
    title: "Leak under kitchen sink",
    notes: "Tenant home after 3pm",
    dueDate: "2026-11-05",
    areas: [
        {
            name: "Kitchen",
            lineItems: [
                { description: "Replace P-trap", priority: "HIGH" },
                { description: "Check cabinet floor", priority: "MEDIUM" },
            ],
        },
        { name: "Bathroom", lineItems: [{ description: "Recaulk tub", priority: "LOW" }] },
    ],
};

const actor: Actor = {
    kind: "office",
    user: { id: "user1", firstName: "Justin", lastName: "W", email: "j@example.com" },
};
const joes = { id: "joes", displayName: "Joe's Plumbing", phone: "8435550100", email: "joe@example.com" };
const tenant = { id: "tenant1", displayName: "Ana Ruiz", phone: "8435550199", email: null };
const create = vi.fn();
const queryRaw = vi.fn();

// The contractor and the unit's tenant are both contacts; tell them apart by the contact type asked for.
function contacts(contractor: typeof joes | null) {
    vi.mocked(prisma.contact.findFirst).mockImplementation((async (args: { where: { contactType: unknown } }) =>
        args.where.contactType === "TENANT" ? tenant : contractor) as never);
}

const run = (overrides: Partial<ParsedConfirmedDraft> = {}, source: "bot" | "mcp" = "bot") =>
    createDraftWorkOrder({ organizationId: "org1", actor, draft: { ...draft, ...overrides }, source });

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.property.findFirst).mockResolvedValue({ id: "prop1" } as never);
    vi.mocked(prisma.unit.findFirst).mockResolvedValue({ id: "unit1" } as never);
    contacts(joes);
    queryRaw.mockResolvedValue([{ lastJobNumber: 1001 }]);
    create.mockImplementation(async ({ data }: { data: { jobNumber: string } }) => ({
        id: "wo1",
        jobNumber: data.jobNumber,
    }));
    vi.mocked(prisma.$transaction).mockImplementation((async (fn: (tx: unknown) => unknown) =>
        fn({ workOrder: { create }, $queryRaw: queryRaw })) as never);
});

describe("createDraftWorkOrder", () => {
    it("only looks up records in the given organization", async () => {
        await run();

        expect(prisma.property.findFirst).toHaveBeenCalledWith({
            where: { id: "prop1", organizationId: "org1", archived: false },
        });
        expect(prisma.unit.findFirst).toHaveBeenCalledWith({
            where: { id: "unit1", propertyId: "prop1", organizationId: "org1", archived: false },
        });
        expect(prisma.contact.findFirst).toHaveBeenCalledWith({
            where: {
                id: "joes",
                organizationId: "org1",
                archived: false,
                contactType: { in: ["CONTRACTOR", "OTHER"] },
            },
        });
        expect(prisma.contact.findFirst).toHaveBeenCalledWith({
            where: { unitId: "unit1", contactType: "TENANT", organizationId: "org1", archived: false },
        });
    });

    it.each([
        ["property", () => vi.mocked(prisma.property.findFirst).mockResolvedValue(null)],
        ["unit", () => vi.mocked(prisma.unit.findFirst).mockResolvedValue(null)],
        ["contractor", () => contacts(null)],
    ])("refuses a %s from another organization without creating or logging anything", async (name, notFound) => {
        notFound();

        const result = await run();

        expect(result).toEqual({ ok: false, error: expect.stringContaining(name) });
        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(logEvent).not.toHaveBeenCalled();
    });

    it("creates a draft with a job number, contact snapshots and ordered areas and line items", async () => {
        const result = await run();

        expect(result).toEqual({ ok: true, workOrder: { id: "wo1", jobNumber: "2026-1001" } });
        expect(queryRaw).toHaveBeenCalledTimes(1);
        const data = create.mock.calls[0][0].data;
        expect(data).toMatchObject({
            organizationId: "org1",
            jobNumber: "2026-1001",
            status: "DRAFT",
            propertyId: "prop1",
            unitId: "unit1",
            title: "Leak under kitchen sink",
            notes: "Tenant home after 3pm",
            dueDate: new Date("2026-11-05"),
            contractorId: "joes",
            contractorName: "Joe's Plumbing",
            contractorPhone: "8435550100",
            tenantId: "tenant1",
            tenantName: "Ana Ruiz",
            tenantPhone: "8435550199",
        });
        expect(data.publicToken).toEqual(expect.any(String));
        expect(data.areas.create).toEqual([
            {
                name: "Kitchen",
                sortOrder: 0,
                lineItems: {
                    create: [
                        { description: "Replace P-trap", priority: "HIGH", sortOrder: 0 },
                        { description: "Check cabinet floor", priority: "MEDIUM", sortOrder: 1 },
                    ],
                },
            },
            {
                name: "Bathroom",
                sortOrder: 1,
                lineItems: { create: [{ description: "Recaulk tub", priority: "LOW", sortOrder: 0 }] },
            },
        ]);
    });

    it("gives each work order its own contractor link token", async () => {
        await run();
        await run();

        const [first, second] = create.mock.calls.map((call) => call[0].data.publicToken);
        expect(first).not.toBe(second);
    });

    it.each(["bot", "mcp"] as const)("logs the draft as created by the given actor from %s", async (source) => {
        await run({}, source);

        expect(logEvent).toHaveBeenCalledWith({
            type: "CREATED",
            workOrderId: "wo1",
            organizationId: "org1",
            actor,
            detail: { source },
        });
    });

    it("leaves the unit, tenant and contractor empty when none were chosen", async () => {
        await run({ unitId: null, contractorId: null });

        expect(prisma.unit.findFirst).not.toHaveBeenCalled();
        expect(prisma.contact.findFirst).not.toHaveBeenCalled();
        expect(create.mock.calls[0][0].data).toMatchObject({
            unitId: null,
            contractorId: null,
            contractorName: null,
            tenantId: null,
            tenantName: null,
        });
    });
});
