import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
    default: {
        property: { findFirst: vi.fn() },
        unit: { findFirst: vi.fn() },
        contact: { findFirst: vi.fn() },
        $transaction: vi.fn(),
    },
}));
vi.mock("@/lib/workOrderCreate", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/workOrderCreate")>()),
    findTenant: vi.fn(),
    nextJobNumber: vi.fn(),
}));
vi.mock("@/lib/parseDescription", () => ({ parseDescription: vi.fn() }));
vi.mock("@/lib/workOrderLookup", () => ({ propertyLookup: vi.fn(), contractorLookup: vi.fn() }));

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { parseDescription } from "@/lib/parseDescription";
import { findTenant, nextJobNumber } from "@/lib/workOrderCreate";
import { contractorLookup, propertyLookup } from "@/lib/workOrderLookup";
import { createDraftFromBot, parseWorkOrderDescription } from "./actions";
import type { ConfirmedDraft } from "./schemas";

const draft: ConfirmedDraft = {
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

const joes = { id: "joes", displayName: "Joe's Plumbing", phone: "8435550100", email: "joe@example.com" };
const tenant = { id: "tenant1", displayName: "Ana Ruiz", phone: "8435550199", email: null };
const create = vi.fn();

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({
        state: "ready",
        user: { id: "user1" },
        organization: { id: "org1" },
    } as never);
    vi.mocked(prisma.property.findFirst).mockResolvedValue({ id: "prop1" } as never);
    vi.mocked(prisma.unit.findFirst).mockResolvedValue({ id: "unit1" } as never);
    vi.mocked(prisma.contact.findFirst).mockResolvedValue(joes as never);
    vi.mocked(findTenant).mockResolvedValue(tenant as never);
    vi.mocked(nextJobNumber).mockResolvedValue("2026-1001");
    create.mockResolvedValue({ id: "wo1" });
    vi.mocked(prisma.$transaction).mockImplementation((async (fn: (tx: unknown) => unknown) =>
        fn({ workOrder: { create } })) as never);
});

describe("parseWorkOrderDescription", () => {
    const parsedDraft = {
        propertyText: "123 Maple St",
        unitText: "4B",
        contractorText: "Joe",
        title: "Fix sink",
        notes: null,
        dueDate: null,
        dueDateText: null,
        areas: [{ name: "Kitchen", lineItems: [{ description: "Fix sink", priority: "MEDIUM" as const }] }],
    };
    const form = (description: string) => {
        const formData = new FormData();
        formData.set("description", description);
        return formData;
    };

    it("rejects a signed-out user without calling the AI", async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({ state: "signed-out" });

        expect(await parseWorkOrderDescription({}, form("Fix the sink"))).toEqual({ error: "Not authorized" });
        expect(parseDescription).not.toHaveBeenCalled();
    });

    it("passes on the AI's error", async () => {
        vi.mocked(parseDescription).mockResolvedValue({ ok: false, error: "Describe the work first." });

        expect(await parseWorkOrderDescription({}, form(" "))).toEqual({ error: "Describe the work first." });
        expect(propertyLookup).not.toHaveBeenCalled();
    });

    it("matches the draft within the user's organization", async () => {
        const property = { property: { status: "notFound" as const }, unit: null };
        const contractor = { status: "notFound" as const };
        vi.mocked(parseDescription).mockResolvedValue({ ok: true, draft: parsedDraft });
        vi.mocked(propertyLookup).mockResolvedValue(property);
        vi.mocked(contractorLookup).mockResolvedValue(contractor);

        const result = await parseWorkOrderDescription({}, form("Fix the sink at 123 Maple 4B, Joe"));

        expect(parseDescription).toHaveBeenCalledWith("Fix the sink at 123 Maple 4B, Joe");
        expect(propertyLookup).toHaveBeenCalledWith("org1", "123 Maple St", "4B");
        expect(contractorLookup).toHaveBeenCalledWith("org1", "Joe");
        expect(result).toEqual({ result: { draft: parsedDraft, property, contractor } });
    });
});

describe("createDraftFromBot", () => {
    it("rejects a signed-out user without touching the database", async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({ state: "signed-out" });

        expect(await createDraftFromBot(draft)).toEqual({ ok: false, error: "Not authorized" });
        expect(prisma.property.findFirst).not.toHaveBeenCalled();
    });

    it("rejects invalid input", async () => {
        const result = await createDraftFromBot({ ...draft, areas: [] });

        expect(result.ok).toBe(false);
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("only looks up records in the user's organization", async () => {
        await createDraftFromBot(draft);

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
        expect(findTenant).toHaveBeenCalledWith("unit1", "org1");
    });

    it.each([
        ["property", () => vi.mocked(prisma.property.findFirst).mockResolvedValue(null)],
        ["unit", () => vi.mocked(prisma.unit.findFirst).mockResolvedValue(null)],
        ["contractor", () => vi.mocked(prisma.contact.findFirst).mockResolvedValue(null)],
    ])("refuses a %s from another organization", async (name, notFound) => {
        notFound();

        const result = await createDraftFromBot(draft);

        expect(result).toEqual({ ok: false, error: expect.stringContaining(name) });
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("creates a draft with contact snapshots and ordered areas and line items, then opens it", async () => {
        await createDraftFromBot(draft);

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
        expect(redirect).toHaveBeenCalledWith("/work-orders/wo1");
    });

    it("leaves the unit and contractor empty when none were chosen", async () => {
        vi.mocked(findTenant).mockResolvedValue(null);

        await createDraftFromBot({ ...draft, unitId: null, contractorId: null });

        expect(prisma.unit.findFirst).not.toHaveBeenCalled();
        expect(prisma.contact.findFirst).not.toHaveBeenCalled();
        expect(create.mock.calls[0][0].data).toMatchObject({ unitId: null, contractorId: null, tenantId: null });
    });
});
