import { z } from "zod";
import { draftArea, type WorkOrderDraft } from "@/lib/workOrderDraft";
import { tooLong } from "@/lib/validation";
import type { ContractorOption, PropertyLookup } from "@/lib/workOrderLookup";
import type { MatchResult } from "@/lib/workOrderMatch";

// What the bot page gets back after the description is read: the AI's draft and what it matched to.
export type ParseState = {
    error?: string;
    result?: { draft: WorkOrderDraft; property: PropertyLookup; contractor: MatchResult<ContractorOption> };
};

const id = z.string().min(1).max(100);

// The draft after the user has confirmed it on the review screen: real IDs instead of the words the AI heard.
// Like the work order form, the unit and contractor can be left empty and filled in later.
export const confirmedDraft = z.object({
    propertyId: id,
    unitId: id.nullable(),
    contractorId: id.nullable(),
    title: z.string().trim().min(1, "Enter a title").max(200, tooLong(200)),
    notes: z
        .string()
        .trim()
        .max(5000, tooLong(5000))
        .nullable()
        .transform((val) => val || null),
    dueDate: z.iso.date().nullable(),
    areas: z.array(draftArea).min(1).max(50),
});

export type ConfirmedDraft = z.input<typeof confirmedDraft>;
