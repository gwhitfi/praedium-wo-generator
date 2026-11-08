"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getAppUrl, sendEmail } from "@/lib/email";
import { completedEmail } from "@/lib/emails/completedEmail";
import { clientIp, RATE_LIMITS, rateLimit } from "@/lib/rateLimit";
import { formatWorkOrderAddress } from "@/lib/workOrders";
import { isLikelyBot, logDailyOpen, logEvent } from "@/lib/workOrderEvents";
import { auth } from "@clerk/nextjs/server";
import { cookies, headers } from "next/headers";
import {
    CONTRACTOR_COOKIE,
    createContractorSession,
    isVerifiedFor,
    sessionCookieOptions,
} from "@/lib/contractorAccess";
import { maskEmail, normalizeEmail } from "@/lib/contractorWorkOrders";
import { checkCode, startVerification } from "@/lib/contractorVerify";
import { completeInput, noteInput, openInput, sendCodeInput, toggleInput, verifyCodeInput } from "./schemas";

// Not the office's OPEN_STATUSES (`@/lib/workOrders`), which includes DRAFT: contractors never act on drafts.
const OPEN_STATUSES = ["SENT", "IN_PROGRESS"] as const;

function isOpen(status: string) {
    return (OPEN_STATUSES as readonly string[]).includes(status);
}

// The same rule as isOpen, as a filter for the writes, so they only apply while it still holds. In-house work orders
// have no contractor, so their link never works.
function openWorkOrderWhere(token: string) {
    return { publicToken: token, archived: false, inHouse: false, status: { in: [...OPEN_STATUSES] } };
}

// The mutations need a verified contractor session. A work order with no contractor email can't be verified, so it
// stays open to anyone with the link, as the page shows it.
async function requireVerified(workOrder: { contractorEmail: string | null }): Promise<void> {
    if (workOrder.contractorEmail && !(await isVerifiedFor(workOrder))) throw new Error("Verification required");
}

// The work order a contractor link shows, with what verification needs. Null when missing, archived, in-house, a
// draft or cancelled, the same rule as the page.
async function loadContractorWorkOrder(token: string) {
    const workOrder = await prisma.workOrder.findUnique({
        where: { publicToken: token },
        include: { organization: { select: { name: true, email: true } } },
    });
    if (
        !workOrder ||
        workOrder.archived ||
        workOrder.inHouse ||
        workOrder.status === "DRAFT" ||
        workOrder.status === "CANCELLED"
    ) {
        return null;
    }
    return workOrder;
}

// Emails a 6-digit code (and a confirm link) to the work order's contractor address.
export async function sendCode(
    token: string,
): Promise<{ ok: true; challengeId: string; emailHint: string } | { ok: false; error: string }> {
    const input = sendCodeInput.safeParse({ token });
    if (!input.success) return { ok: false, error: "This link isn't valid." };

    const workOrder = await loadContractorWorkOrder(input.data.token);
    if (!workOrder) return { ok: false, error: "This work order isn't available." };
    // A closed job only ever shows the summary, so there's nothing to verify for.
    if (workOrder.status === "CLOSED") return { ok: false, error: "This work order is closed." };
    if (!workOrder.contractorEmail) return { ok: false, error: "This work order has no contractor email on file." };

    let appUrl: string;
    try {
        appUrl = getAppUrl();
    } catch (error) {
        console.error("sendCode: no app URL", error);
        return { ok: false, error: "Couldn't send the email. Try again." };
    }

    const result = await startVerification({
        workOrder,
        organization: workOrder.organization,
        appUrl,
        ip: clientIp(await headers()),
    });
    if ("error" in result) return { ok: false, error: result.error };

    return { ok: true, challengeId: result.challengeId, emailHint: maskEmail(workOrder.contractorEmail) };
}

// Checks the code and, when it's right, remembers this browser with a contractor session cookie.
export async function verifyCode(
    token: string,
    challengeId: string,
    code: string,
    remember: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
    const input = verifyCodeInput.safeParse({ token, challengeId, code, remember });
    if (!input.success) return { ok: false, error: "Enter the 6-digit code from the email." };

    const workOrder = await loadContractorWorkOrder(input.data.token);
    if (!workOrder) return { ok: false, error: "This work order isn't available." };
    if (workOrder.status === "CLOSED") return { ok: false, error: "This work order is closed." };

    const result = await checkCode({
        workOrderId: workOrder.id,
        challengeId: input.data.challengeId,
        code: input.data.code,
    });
    if (!result.ok) return result;
    // The office changed the contractor's email after the code was sent.
    if (!workOrder.contractorEmail || normalizeEmail(workOrder.contractorEmail) !== result.email) {
        return { ok: false, error: "The email on this work order has changed. Send a new code." };
    }

    const session = await createContractorSession({
        email: result.email,
        remember: input.data.remember,
        userAgent: (await headers()).get("user-agent"),
    });
    (await cookies()).set(CONTRACTOR_COOKIE, session.token, sessionCookieOptions(input.data.remember));

    await logEvent({
        type: "VERIFIED",
        workOrderId: workOrder.id,
        organizationId: workOrder.organizationId,
        actor: { kind: "contractor", name: workOrder.contractorName },
    });

    revalidatePath(`/wo/${input.data.token}`);
    return { ok: true };
}

async function getOpenLineItem(token: string, lineItemId: string) {
    const lineItem = await prisma.lineItem.findFirst({
        where: { id: lineItemId, area: { workOrder: { publicToken: token } } },
        include: { area: { include: { workOrder: true } } },
    });

    if (!lineItem) throw new Error("Invalid line item");
    const { workOrder } = lineItem.area;
    if (workOrder.archived || workOrder.inHouse || !isOpen(workOrder.status)) {
        throw new Error("Work order is not open");
    }

    return lineItem;
}

async function checkRate(token: string): Promise<void> {
    const result = await rateLimit(`contractor:${token}`, RATE_LIMITS.contractor);
    if (!result.ok) throw new Error("Too many requests");
}

function revalidate(token: string, workOrderId: string) {
    revalidatePath(`/wo/${token}`);
    revalidatePath(`/work-orders/${workOrderId}`);
    revalidatePath("/work-orders");
}

export async function toggleLineItem(token: string, lineItemId: string): Promise<void> {
    const input = toggleInput.parse({ token, lineItemId });
    await checkRate(input.token);
    const lineItem = await getOpenLineItem(input.token, input.lineItemId);
    const workOrder = lineItem.area.workOrder;
    await requireVerified(workOrder);
    const completed = !lineItem.completed;

    // Conditional on the work order still being open under this token, in case it was closed, cancelled, archived or
    // re-tokened since the check above.
    const [updated] = await prisma.$transaction([
        prisma.lineItem.updateMany({
            where: { id: lineItem.id, area: { workOrder: openWorkOrderWhere(input.token) } },
            data: { completed, completedAt: completed ? new Date() : null },
        }),
        ...(completed && workOrder.status === "SENT"
            ? [
                  prisma.workOrder.updateMany({
                      where: { id: workOrder.id, publicToken: input.token, status: "SENT", archived: false },
                      data: { status: "IN_PROGRESS" },
                  }),
              ]
            : []),
    ]);
    if (updated.count === 0) throw new Error("Work order is not open");
    await logEvent({
        type: completed ? "ITEM_CHECKED" : "ITEM_UNCHECKED",
        workOrderId: workOrder.id,
        organizationId: workOrder.organizationId,
        actor: { kind: "contractor", name: workOrder.contractorName },
        detail: { item: lineItem.description, area: lineItem.area.name },
    });

    revalidate(input.token, workOrder.id);
}

export async function saveLineItemNote(token: string, lineItemId: string, note: string): Promise<void> {
    const input = noteInput.parse({ token, lineItemId, note });
    await checkRate(input.token);
    const lineItem = await getOpenLineItem(input.token, input.lineItemId);
    await requireVerified(lineItem.area.workOrder);

    const updated = await prisma.lineItem.updateMany({
        where: { id: lineItem.id, area: { workOrder: openWorkOrderWhere(input.token) } },
        data: { contractorNotes: input.note },
    });
    if (updated.count === 0) throw new Error("Work order is not open");
    if (input.note !== lineItem.contractorNotes) {
        const workOrder = lineItem.area.workOrder;
        await logEvent({
            type: "NOTE_SAVED",
            workOrderId: workOrder.id,
            organizationId: workOrder.organizationId,
            actor: { kind: "contractor", name: workOrder.contractorName },
            // An empty note means the contractor cleared it.
            detail: { item: lineItem.description, area: lineItem.area.name, note: input.note ?? "" },
        });
    }

    revalidate(input.token, lineItem.area.workOrderId);
}

// Records that the contractor opened the page, at most once per day. RecordOpen calls it after the tab has been
// visible for 2 seconds, so most link scanners and previews never get here. Only counts work orders the page
// actually shows. Never throws.
export async function recordOpen(token: string): Promise<void> {
    try {
        const input = openInput.safeParse({ token });
        if (!input.success) return;
        if (isLikelyBot((await headers()).get("user-agent"))) return;

        const workOrder = await prisma.workOrder.findUnique({
            where: { publicToken: input.data.token },
            select: {
                id: true,
                organizationId: true,
                status: true,
                archived: true,
                inHouse: true,
                contractorName: true,
                organization: { select: { clerkOrgId: true } },
            },
        });
        if (
            !workOrder ||
            workOrder.archived ||
            workOrder.inHouse ||
            workOrder.status === "DRAFT" ||
            workOrder.status === "CANCELLED"
        ) {
            return;
        }

        // Office staff checking what the contractor sees aren't the contractor.
        const { orgId } = await auth();
        if (orgId && orgId === workOrder.organization.clerkOrgId) return;

        await logDailyOpen({
            workOrderId: workOrder.id,
            organizationId: workOrder.organizationId,
            contractorName: workOrder.contractorName,
        });
    } catch (error) {
        console.error("recordOpen failed", error);
    }
}

function loadForCompletion(token: string) {
    return prisma.workOrder.findUnique({
        where: { publicToken: token },
        include: {
            organization: { select: { name: true, email: true } },
            property: true,
            unit: true,
            areas: {
                orderBy: { sortOrder: "asc" },
                include: { lineItems: { orderBy: { sortOrder: "asc" } } },
            },
        },
    });
}

type CompletionWorkOrder = NonNullable<Awaited<ReturnType<typeof loadForCompletion>>>;

export async function completeWorkOrder(token: string, completionNotes: string): Promise<void> {
    const input = completeInput.parse({ token, completionNotes });
    await checkRate(input.token);
    const workOrder = await loadForCompletion(input.token);

    if (!workOrder) throw new Error("Invalid work order");
    if (workOrder.archived || workOrder.inHouse || !isOpen(workOrder.status)) throw new Error("Work order is not open");
    await requireVerified(workOrder);

    const completedAt = new Date();
    const notes = input.completionNotes;

    const updated = await prisma.workOrder.updateMany({
        where: { id: workOrder.id, ...openWorkOrderWhere(input.token) },
        data: { status: "COMPLETED", completedAt, completionNotes: notes },
    });
    if (updated.count === 0) throw new Error("Work order is not open");
    await logEvent({
        type: "COMPLETED_BY_CONTRACTOR",
        workOrderId: workOrder.id,
        organizationId: workOrder.organizationId,
        actor: { kind: "contractor", name: workOrder.contractorName },
        detail: { notes },
    });

    revalidate(input.token, workOrder.id);

    after(() => notifyOffice({ ...workOrder, completedAt, completionNotes: notes }));
}

async function notifyOffice(workOrder: CompletionWorkOrder) {
    const to = workOrder.organization.email;
    if (!to) {
        console.info(`No office email set; skipped completion notice for work order ${workOrder.id}`);
        return;
    }

    try {
        const email = completedEmail({
            organizationName: workOrder.organization.name,
            contractorName: workOrder.contractorName,
            contractorEmail: workOrder.contractorEmail,
            title: workOrder.title,
            jobNumber: workOrder.jobNumber,
            address: formatWorkOrderAddress(workOrder.property, workOrder.unit),
            completedAt: workOrder.completedAt ?? new Date(),
            completionNotes: workOrder.completionNotes,
            areas: workOrder.areas,
            url: `${getAppUrl()}/work-orders/${workOrder.id}`,
        });

        await sendEmail({ to, ...email, replyTo: workOrder.contractorEmail, fromName: workOrder.contractorName });
    } catch (error) {
        console.error(`Completion notice failed for work order ${workOrder.id}`, error);
    }
}
