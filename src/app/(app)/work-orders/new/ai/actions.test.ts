import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/workOrderCreate", () => ({ createDraftWorkOrder: vi.fn() }));
vi.mock("@/lib/parseDescription", () => ({ parseDescription: vi.fn() }));
vi.mock("@/lib/workOrderLookup", () => ({ propertyLookup: vi.fn(), contractorLookup: vi.fn() }));

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { parseDescription } from "@/lib/parseDescription";
import { createDraftWorkOrder } from "@/lib/workOrderCreate";
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

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({
        state: "ready",
        user: { id: "user1" },
        organization: { id: "org1" },
    } as never);
    vi.mocked(createDraftWorkOrder).mockResolvedValue({ ok: true, workOrder: { id: "wo1", jobNumber: "2026-1001" } });
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

    it("refuses without calling the AI when the user turned AI off", async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({
            state: "ready",
            user: { id: "user1", aiEnabled: false },
            organization: { id: "org1" },
        } as never);

        expect(await parseWorkOrderDescription({}, form("Fix the sink"))).toEqual({
            error: "AI is turned off in your Settings.",
        });
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

// The ownership checks, snapshots and event are tested with createDraftWorkOrder in src/lib/workOrderCreate.test.ts.
describe("createDraftFromBot", () => {
    it("rejects a signed-out user without creating anything", async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({ state: "signed-out" });

        expect(await createDraftFromBot(draft)).toEqual({ ok: false, error: "Not authorized" });
        expect(createDraftWorkOrder).not.toHaveBeenCalled();
    });

    it("rejects invalid input", async () => {
        const result = await createDraftFromBot({ ...draft, areas: [] });

        expect(result.ok).toBe(false);
        expect(createDraftWorkOrder).not.toHaveBeenCalled();
    });

    it("creates the draft in the user's organization as the bot, then opens it", async () => {
        await createDraftFromBot({ ...draft, title: "  Leak under kitchen sink  ", notes: " " });

        expect(createDraftWorkOrder).toHaveBeenCalledWith({
            organizationId: "org1",
            actor: { kind: "office", user: { id: "user1" } },
            draft: { ...draft, title: "Leak under kitchen sink", notes: null },
            source: "bot",
        });
        expect(revalidatePath).toHaveBeenCalledWith("/work-orders");
        expect(redirect).toHaveBeenCalledWith("/work-orders/wo1");
    });

    it("returns the refusal without opening anything", async () => {
        const refused = { ok: false as const, error: "That property wasn't found. Choose it again." };
        vi.mocked(createDraftWorkOrder).mockResolvedValue(refused);

        expect(await createDraftFromBot(draft)).toEqual(refused);
        expect(redirect).not.toHaveBeenCalled();
    });
});
