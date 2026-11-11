// Shared by the work order Server Actions. Not a "use server" file: it exports a constant and plain functions.
import { z } from "zod";
import type { WorkOrderStatus } from "@/generated/prisma/enums";
import { OPEN_STATUSES } from "@/lib/workOrders";
import type { ActionResult } from "@/lib/actionResult";

// Areas and line items can change only while the work order is open and not archived, matching the page's readOnly.
export const NOT_EDITABLE: ActionResult = { ok: false, error: "This work order can't be edited" };

export function isEditable(workOrder: { status: WorkOrderStatus; archived: boolean }): boolean {
    return !workOrder.archived && OPEN_STATUSES.includes(workOrder.status);
}

// The first message from a failed Zod parse, as a refusal.
export function invalid(error: z.ZodError): { ok: false; error: string } {
    return { ok: false, error: error.issues[0]?.message ?? "Invalid input" };
}
