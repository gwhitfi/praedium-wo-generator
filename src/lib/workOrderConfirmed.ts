import { z } from "zod";
import { draftArea } from "@/lib/workOrderDraft";
import { tooLong } from "@/lib/validation";

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

// A confirmed draft after confirmedDraft.safeParse() succeeded: trimmed, with blank notes as null.
export type ParsedConfirmedDraft = z.output<typeof confirmedDraft>;
