import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
    default: {
        lineItem: { findFirst: vi.fn(), update: vi.fn() },
        workOrder: { findUnique: vi.fn(), update: vi.fn() },
        $transaction: vi.fn(),
    },
}));
vi.mock("@/lib/email", () => ({ getAppUrl: vi.fn(), sendEmail: vi.fn() }));
vi.mock("@/lib/emails/completedEmail", () => ({ completedEmail: vi.fn() }));
vi.mock("@/lib/workOrderEvents", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/workOrderEvents")>()),
    logEvent: vi.fn(),
    logDailyOpen: vi.fn(),
}));
vi.mock("@/lib/rateLimit", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/rateLimit")>()),
    rateLimit: vi.fn(),
}));

import { auth } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import prisma from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";
import { logDailyOpen, logEvent } from "@/lib/workOrderEvents";
import { completeWorkOrder, recordOpen, saveLineItemNote, toggleLineItem } from "./actions";

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0";
const contractor = { kind: "contractor", name: "Marcus Hill" };
const ids = { workOrderId: "wo1", organizationId: "org1" };
const workOrder = {
    id: "wo1",
    organizationId: "org1",
    status: "SENT",
    archived: false,
    contractorName: "Marcus Hill",
    organization: { clerkOrgId: "clerk_org1", name: "Acme Property", email: null },
    areas: [],
};

function withLineItem(changes: Record<string, unknown> = {}, workOrderChanges: Record<string, unknown> = {}) {
    vi.mocked(prisma.lineItem.findFirst).mockResolvedValue({
        id: "li1",
        description: "Replace faucet",
        completed: false,
        contractorNotes: null,
        area: { name: "Kitchen", workOrderId: "wo1", workOrder: { ...workOrder, ...workOrderChanges } },
        ...changes,
    } as never);
}

function withWorkOrder(changes: Record<string, unknown> = {}) {
    vi.mocked(prisma.workOrder.findUnique).mockResolvedValue({ ...workOrder, ...changes } as never);
}

beforeEach(() => {
    vi.clearAllMocks();
    withLineItem();
    withWorkOrder();
    vi.mocked(headers).mockResolvedValue(new Headers({ "user-agent": CHROME }) as never);
    vi.mocked(auth).mockResolvedValue({ orgId: null } as never);
    vi.mocked(rateLimit).mockResolvedValue({ ok: true, remaining: 1, retryAfterSeconds: 0 });
});

describe("toggleLineItem", () => {
    it("logs a check-off with the item and area", async () => {
        await toggleLineItem("token1", "li1");

        expect(logEvent).toHaveBeenCalledWith({
            ...ids,
            type: "ITEM_CHECKED",
            actor: contractor,
            detail: { item: "Replace faucet", area: "Kitchen" },
        });
    });

    it("logs unchecking", async () => {
        withLineItem({ completed: true });

        await toggleLineItem("token1", "li1");

        expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "ITEM_UNCHECKED" }));
    });

    it("doesn't log on a wrong token", async () => {
        vi.mocked(prisma.lineItem.findFirst).mockResolvedValue(null);

        await expect(toggleLineItem("wrong", "li1")).rejects.toThrow();
        expect(logEvent).not.toHaveBeenCalled();
    });

    it.each([{ archived: true }, { status: "COMPLETED" }, { status: "CLOSED" }])(
        "doesn't log when the work order isn't open (%o)",
        async (changes) => {
            withLineItem({}, changes);

            await expect(toggleLineItem("token1", "li1")).rejects.toThrow();
            expect(logEvent).not.toHaveBeenCalled();
        },
    );

    it("refuses an over-limit toggle before touching the database", async () => {
        vi.mocked(rateLimit).mockResolvedValue({ ok: false, remaining: 0, retryAfterSeconds: 30 });

        await expect(toggleLineItem("token1", "li1")).rejects.toThrow("Too many requests");
        expect(rateLimit).toHaveBeenCalledWith("contractor:token1", expect.any(Object));
        expect(prisma.lineItem.findFirst).not.toHaveBeenCalled();
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });
});

describe("saveLineItemNote", () => {
    it("logs the note", async () => {
        await saveLineItemNote("token1", "li1", "Shutoff valve is seized");

        expect(logEvent).toHaveBeenCalledWith({
            ...ids,
            type: "NOTE_SAVED",
            actor: contractor,
            detail: { item: "Replace faucet", area: "Kitchen", note: "Shutoff valve is seized" },
        });
    });

    it("logs a cleared note as empty", async () => {
        withLineItem({ contractorNotes: "Old note" });

        await saveLineItemNote("token1", "li1", "  ");

        expect(logEvent).toHaveBeenCalledWith(
            expect.objectContaining({ detail: { item: "Replace faucet", area: "Kitchen", note: "" } }),
        );
    });

    it("doesn't log a note that didn't change", async () => {
        withLineItem({ contractorNotes: "Same note" });

        await saveLineItemNote("token1", "li1", "Same note");

        expect(logEvent).not.toHaveBeenCalled();
    });
});

describe("completeWorkOrder", () => {
    it("logs the completion with the contractor's notes", async () => {
        await completeWorkOrder("token1", "All done, left spare parts under the sink");

        expect(logEvent).toHaveBeenCalledWith({
            ...ids,
            type: "COMPLETED_BY_CONTRACTOR",
            actor: contractor,
            detail: { notes: "All done, left spare parts under the sink" },
        });
    });

    it("doesn't log when the work order isn't open", async () => {
        withWorkOrder({ status: "COMPLETED" });

        await expect(completeWorkOrder("token1", "")).rejects.toThrow();
        expect(logEvent).not.toHaveBeenCalled();
    });
});

describe("recordOpen", () => {
    it("records the open by token", async () => {
        await recordOpen("token1");

        expect(prisma.workOrder.findUnique).toHaveBeenCalledWith(
            expect.objectContaining({ where: { publicToken: "token1" } }),
        );
        expect(logDailyOpen).toHaveBeenCalledWith({ ...ids, contractorName: "Marcus Hill" });
    });

    it("counts completed and closed work orders, which the page still shows", async () => {
        withWorkOrder({ status: "CLOSED" });

        await recordOpen("token1");

        expect(logDailyOpen).toHaveBeenCalled();
    });

    it.each([{ archived: true }, { status: "DRAFT" }, { status: "CANCELLED" }])(
        "skips a work order the page doesn't show (%o)",
        async (changes) => {
            withWorkOrder(changes);

            await recordOpen("token1");

            expect(logDailyOpen).not.toHaveBeenCalled();
        },
    );

    it("skips an unknown or invalid token", async () => {
        vi.mocked(prisma.workOrder.findUnique).mockResolvedValue(null);

        await recordOpen("wrong");
        await recordOpen("");

        expect(logDailyOpen).not.toHaveBeenCalled();
    });

    it("skips office staff from the same organization", async () => {
        vi.mocked(auth).mockResolvedValue({ orgId: "clerk_org1" } as never);

        await recordOpen("token1");

        expect(logDailyOpen).not.toHaveBeenCalled();
    });

    it("still counts someone signed in to a different organization", async () => {
        vi.mocked(auth).mockResolvedValue({ orgId: "clerk_other" } as never);

        await recordOpen("token1");

        expect(logDailyOpen).toHaveBeenCalled();
    });

    it("skips bots without looking up the work order", async () => {
        vi.mocked(headers).mockResolvedValue(new Headers({ "user-agent": "Slackbot-LinkExpanding 1.0" }) as never);

        await recordOpen("token1");

        expect(prisma.workOrder.findUnique).not.toHaveBeenCalled();
        expect(logDailyOpen).not.toHaveBeenCalled();
    });

    it("never throws", async () => {
        vi.mocked(prisma.workOrder.findUnique).mockRejectedValue(new Error("database down"));
        vi.spyOn(console, "error").mockImplementation(() => {});

        await expect(recordOpen("token1")).resolves.toBeUndefined();
    });
});
