"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getAppUrl, sendEmail } from "@/lib/email";
import { completedEmail } from "@/lib/emails/completedEmail";
import { RATE_LIMITS, rateLimit } from "@/lib/rateLimit";
import { formatWorkOrderAddress } from "@/lib/workOrders";
import { isLikelyBot, logDailyOpen, logEvent } from "@/lib/workOrderEvents";
import { auth } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { completeInput, noteInput, openInput, toggleInput } from "./schemas";

const OPEN_STATUSES = ["SENT", "IN_PROGRESS"] as const;

function isOpen(status: string) {
    return (OPEN_STATUSES as readonly string[]).includes(status);
}

async function getOpenLineItem(token: string, lineItemId: string) {
    const lineItem = await prisma.lineItem.findFirst({
        where: { id: lineItemId, area: { workOrder: { publicToken: token } } },
        include: { area: { include: { workOrder: true } } },
    });

    if (!lineItem) throw new Error("Invalid line item");
    if (lineItem.area.workOrder.archived || !isOpen(lineItem.area.workOrder.status)) {
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
    const completed = !lineItem.completed;

    await prisma.$transaction([
        prisma.lineItem.update({
            where: { id: lineItem.id },
            data: { completed, completedAt: completed ? new Date() : null },
        }),
        ...(completed && workOrder.status === "SENT"
            ? [prisma.workOrder.update({ where: { id: workOrder.id }, data: { status: "IN_PROGRESS" } })]
            : []),
    ]);
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

    await prisma.lineItem.update({
        where: { id: lineItem.id },
        data: { contractorNotes: input.note },
    });
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
                contractorName: true,
                organization: { select: { clerkOrgId: true } },
            },
        });
        if (!workOrder || workOrder.archived || workOrder.status === "DRAFT" || workOrder.status === "CANCELLED") {
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
    if (workOrder.archived || !isOpen(workOrder.status)) throw new Error("Work order is not open");

    const completedAt = new Date();
    const notes = input.completionNotes;

    await prisma.workOrder.update({
        where: { id: workOrder.id },
        data: { status: "COMPLETED", completedAt, completionNotes: notes },
    });
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
