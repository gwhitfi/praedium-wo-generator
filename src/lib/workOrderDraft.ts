import { z } from "zod";
import { LineItemPriority } from "@/generated/prisma/enums";
import { tooLong } from "@/lib/validation";

const requiredText = (max: number) => z.string().trim().min(1).max(max, tooLong(max));

// Null or blank becomes null.
const nullableText = (max: number) =>
    z
        .string()
        .trim()
        .max(max, tooLong(max))
        .nullable()
        .transform((val) => val || null);

export const draftLineItem = z.object({
    description: requiredText(1000),
    priority: z.enum(LineItemPriority),
});

export const draftArea = z.object({
    name: requiredText(100),
    lineItems: z.array(draftLineItem).min(1).max(100),
});

// A work order described in plain words, before matching to real records. The *Text fields hold what the user
// said ("123 Maple", "Joe the plumber"); the server matches them to the organization's properties and contacts.
export const workOrderDraft = z.object({
    propertyText: requiredText(200),
    unitText: nullableText(100),
    contractorText: nullableText(200),
    title: requiredText(200),
    notes: nullableText(5000),
    dueDate: z.iso.date().nullable(),
    // The user's own words for the deadline ("next Friday"), so the review screen can ask them to confirm the date.
    dueDateText: nullableText(100),
    areas: z.array(draftArea).min(1).max(50),
});

export type WorkOrderDraft = z.infer<typeof workOrderDraft>;
