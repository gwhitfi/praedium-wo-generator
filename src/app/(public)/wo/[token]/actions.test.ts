import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(), cookies: vi.fn() }));
vi.mock("@/lib/contractorAccess", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/contractorAccess")>()),
    isVerifiedFor: vi.fn(),
    createContractorSession: vi.fn(),
}));
vi.mock("@/lib/contractorVerify", () => ({ startVerification: vi.fn(), checkCode: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
    default: {
        lineItem: { findFirst: vi.fn(), updateMany: vi.fn() },
        workOrder: { findUnique: vi.fn(), updateMany: vi.fn() },
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
import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createContractorSession, isVerifiedFor } from "@/lib/contractorAccess";
import { checkCode, startVerification } from "@/lib/contractorVerify";
import { getAppUrl } from "@/lib/email";
import prisma from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";
import { logDailyOpen, logEvent } from "@/lib/workOrderEvents";
import { completeWorkOrder, recordOpen, saveLineItemNote, sendCode, toggleLineItem, verifyCode } from "./actions";

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
    vi.mocked(prisma.lineItem.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(prisma.workOrder.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(prisma.$transaction).mockImplementation((async (queries: Promise<unknown>[]) =>
        Promise.all(queries)) as never);
});

const openFilter = { publicToken: "token1", archived: false, status: { in: ["SENT", "IN_PROGRESS"] } };

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

    it("writes only while the work order is still open under this token, and starts it", async () => {
        await toggleLineItem("token1", "li1");

        expect(prisma.lineItem.updateMany).toHaveBeenCalledWith({
            where: { id: "li1", area: { workOrder: openFilter } },
            data: { completed: true, completedAt: expect.any(Date) },
        });
        expect(prisma.workOrder.updateMany).toHaveBeenCalledWith({
            where: { id: "wo1", publicToken: "token1", status: "SENT", archived: false },
            data: { status: "IN_PROGRESS" },
        });
    });

    it("throws without logging when the work order changed after the check", async () => {
        vi.mocked(prisma.lineItem.updateMany).mockResolvedValue({ count: 0 } as never);

        await expect(toggleLineItem("token1", "li1")).rejects.toThrow("Work order is not open");
        expect(logEvent).not.toHaveBeenCalled();
        expect(revalidatePath).not.toHaveBeenCalled();
    });

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

    it("writes only while the work order is still open under this token", async () => {
        await saveLineItemNote("token1", "li1", "note");

        expect(prisma.lineItem.updateMany).toHaveBeenCalledWith({
            where: { id: "li1", area: { workOrder: openFilter } },
            data: { contractorNotes: "note" },
        });
    });

    it("throws without logging when the work order changed after the check", async () => {
        vi.mocked(prisma.lineItem.updateMany).mockResolvedValue({ count: 0 } as never);

        await expect(saveLineItemNote("token1", "li1", "note")).rejects.toThrow("Work order is not open");
        expect(logEvent).not.toHaveBeenCalled();
        expect(revalidatePath).not.toHaveBeenCalled();
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

    it("writes only while the work order is still open under this token", async () => {
        await completeWorkOrder("token1", "Done");

        expect(prisma.workOrder.updateMany).toHaveBeenCalledWith({
            where: { id: "wo1", ...openFilter },
            data: { status: "COMPLETED", completedAt: expect.any(Date), completionNotes: "Done" },
        });
    });

    it("throws without logging or notifying when the work order changed after the check", async () => {
        vi.mocked(prisma.workOrder.updateMany).mockResolvedValue({ count: 0 } as never);

        await expect(completeWorkOrder("token1", "Done")).rejects.toThrow("Work order is not open");
        expect(logEvent).not.toHaveBeenCalled();
        expect(after).not.toHaveBeenCalled();
    });
});

describe("verification gate", () => {
    const email = { contractorEmail: "marcus@example.com" };

    it("refuses check-offs, notes and completion from an unverified browser", async () => {
        withLineItem({}, email);
        withWorkOrder(email);
        vi.mocked(isVerifiedFor).mockResolvedValue(false);

        await expect(toggleLineItem("token1", "li1")).rejects.toThrow("Verification required");
        await expect(saveLineItemNote("token1", "li1", "note")).rejects.toThrow("Verification required");
        await expect(completeWorkOrder("token1", "")).rejects.toThrow("Verification required");
        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(prisma.lineItem.updateMany).not.toHaveBeenCalled();
        expect(prisma.workOrder.updateMany).not.toHaveBeenCalled();
        expect(logEvent).not.toHaveBeenCalled();
    });

    it("allows a verified browser", async () => {
        withLineItem({}, email);
        vi.mocked(isVerifiedFor).mockResolvedValue(true);

        await toggleLineItem("token1", "li1");

        expect(isVerifiedFor).toHaveBeenCalledWith(expect.objectContaining(email));
        expect(prisma.$transaction).toHaveBeenCalled();
    });

    it("leaves a work order without a contractor email open, as before", async () => {
        await toggleLineItem("token1", "li1");

        expect(isVerifiedFor).not.toHaveBeenCalled();
        expect(prisma.$transaction).toHaveBeenCalled();
    });
});

describe("sendCode", () => {
    it("starts verification for the work order and returns a masked email", async () => {
        withWorkOrder({ contractorEmail: "Marcus@HillPlumbing.com", publicToken: "token1" });
        vi.mocked(getAppUrl).mockReturnValue("https://example.com");
        vi.mocked(startVerification).mockResolvedValue({ challengeId: "ch1" });

        expect(await sendCode("token1")).toEqual({
            ok: true,
            challengeId: "ch1",
            emailHint: "m•••@hillplumbing.com",
        });
        expect(startVerification).toHaveBeenCalledWith({
            workOrder: expect.objectContaining({ id: "wo1", contractorEmail: "Marcus@HillPlumbing.com" }),
            organization: workOrder.organization,
            appUrl: "https://example.com",
            ip: "unknown",
        });
    });

    it("passes the client IP for the per-IP limit", async () => {
        withWorkOrder({ contractorEmail: "marcus@example.com" });
        vi.mocked(headers).mockResolvedValue(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }) as never);
        vi.mocked(getAppUrl).mockReturnValue("https://example.com");
        vi.mocked(startVerification).mockResolvedValue({ challengeId: "ch1" });

        await sendCode("token1");

        expect(startVerification).toHaveBeenCalledWith(expect.objectContaining({ ip: "203.0.113.7" }));
    });

    it("refuses a closed work order", async () => {
        withWorkOrder({ contractorEmail: "marcus@example.com", status: "CLOSED" });

        expect(await sendCode("token1")).toEqual({ ok: false, error: "This work order is closed." });
        expect(startVerification).not.toHaveBeenCalled();
    });

    it("refuses a work order without a contractor email", async () => {
        expect(await sendCode("token1")).toEqual({
            ok: false,
            error: "This work order has no contractor email on file.",
        });
        expect(startVerification).not.toHaveBeenCalled();
    });

    it("passes on a rate-limit error", async () => {
        withWorkOrder({ contractorEmail: "marcus@example.com" });
        vi.mocked(getAppUrl).mockReturnValue("https://example.com");
        vi.mocked(startVerification).mockResolvedValue({ error: "Too many codes sent. Try again later." });

        expect(await sendCode("token1")).toEqual({ ok: false, error: "Too many codes sent. Try again later." });
    });
});

describe("verifyCode", () => {
    const cookieSet = vi.fn();

    beforeEach(() => {
        withWorkOrder({ contractorEmail: " Marcus@Example.com" });
        vi.mocked(cookies).mockResolvedValue({ set: cookieSet } as never);
        vi.mocked(createContractorSession).mockResolvedValue({ token: "session-key", expiresAt: new Date() });
    });

    it("creates a session, sets the cookie and logs VERIFIED on the right code", async () => {
        vi.mocked(checkCode).mockResolvedValue({ ok: true, email: "marcus@example.com" });

        expect(await verifyCode("token1", "ch1", "123456", false)).toEqual({ ok: true });
        expect(checkCode).toHaveBeenCalledWith({ workOrderId: "wo1", challengeId: "ch1", code: "123456" });
        expect(createContractorSession).toHaveBeenCalledWith({
            email: "marcus@example.com",
            remember: false,
            userAgent: CHROME,
        });
        expect(cookieSet).toHaveBeenCalledWith(
            "praedium_contractor",
            "session-key",
            expect.objectContaining({ httpOnly: true, path: "/wo" }),
        );
        expect(cookieSet.mock.calls[0][2]).not.toHaveProperty("maxAge");
        expect(logEvent).toHaveBeenCalledWith({ ...ids, type: "VERIFIED", actor: contractor });
        expect(revalidatePath).toHaveBeenCalledWith("/wo/token1");
    });

    it("returns the error and sets nothing on a wrong code", async () => {
        vi.mocked(checkCode).mockResolvedValue({ ok: false, error: "That code isn't right. 4 attempts left." });

        expect(await verifyCode("token1", "ch1", "000000", true)).toEqual({
            ok: false,
            error: "That code isn't right. 4 attempts left.",
        });
        expect(createContractorSession).not.toHaveBeenCalled();
        expect(cookieSet).not.toHaveBeenCalled();
        expect(logEvent).not.toHaveBeenCalled();
    });

    it("refuses a closed work order without checking the code", async () => {
        withWorkOrder({ contractorEmail: "marcus@example.com", status: "CLOSED" });

        expect(await verifyCode("token1", "ch1", "123456", true)).toEqual({
            ok: false,
            error: "This work order is closed.",
        });
        expect(checkCode).not.toHaveBeenCalled();
        expect(cookieSet).not.toHaveBeenCalled();
    });

    it("rejects a malformed code without checking it", async () => {
        expect(await verifyCode("token1", "ch1", "12345", true)).toMatchObject({ ok: false });
        expect(checkCode).not.toHaveBeenCalled();
    });

    it("refuses when the work order's email changed after the code was sent", async () => {
        vi.mocked(checkCode).mockResolvedValue({ ok: true, email: "old@example.com" });

        expect(await verifyCode("token1", "ch1", "123456", true)).toMatchObject({ ok: false });
        expect(cookieSet).not.toHaveBeenCalled();
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
