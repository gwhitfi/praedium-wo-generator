import { z } from "zod";
import { LineItemPriority } from "@/generated/prisma/enums";
import { IN_HOUSE } from "@/lib/defaults";
import { optionalText, tooLong } from "@/lib/validation";

export const MAX_TITLE_LENGTH = 200;
export const MAX_NOTES_LENGTH = 5000;

// The work order form (create and edit). `propertyId` is only read when creating: an existing work order keeps its
// property. The contractor dropdown sends a contact's id, IN_HOUSE, or "" for "Assign later".
export const workOrderFormInput = z
    .object({
        title: z.string().trim().min(1, "Enter a title").max(MAX_TITLE_LENGTH, tooLong(MAX_TITLE_LENGTH)),
        propertyId: optionalText(100),
        unitId: optionalText(100),
        contractorId: optionalText(100),
        notes: optionalText(MAX_NOTES_LENGTH),
        dueDate: z
            .union([z.literal(""), z.iso.date("Enter a date like 2026-11-20")])
            .optional()
            .transform((value) => (value ? new Date(value) : null)),
        notifyTenant: z.boolean(),
    })
    .transform(({ contractorId, ...fields }) => ({
        ...fields,
        inHouse: contractorId === IN_HOUSE,
        contractorId: contractorId === IN_HOUSE ? null : contractorId,
    }));

export type WorkOrderFormFields = z.output<typeof workOrderFormInput>;

export const MAX_AREA_NAME_LENGTH = 100;
export const MAX_ITEM_LENGTH = 1000;
// The area a first item goes into when no area name is given.
export const DEFAULT_AREA_NAME = "General";

// Optional on the create form: the first area and line item, so a one-line job can be written up in one step and
// sent from the work order page. Null when neither is filled in; an area name alone creates an empty area.
export const firstItemInput = z
    .object({
        firstArea: optionalText(MAX_AREA_NAME_LENGTH),
        firstItem: optionalText(MAX_ITEM_LENGTH),
        firstPriority: z.enum(LineItemPriority).catch("MEDIUM"),
    })
    .transform(({ firstArea, firstItem, firstPriority }) =>
        firstArea || firstItem
            ? {
                  areaName: firstArea ?? DEFAULT_AREA_NAME,
                  item: firstItem ? { description: firstItem, priority: firstPriority } : null,
              }
            : null,
    );

// The raw fields; firstItemInput turns an unknown priority into Medium.
export function readFirstItemFormData(formData: FormData): {
    firstArea?: string;
    firstItem?: string;
    firstPriority?: string;
} {
    const text = (name: string) => {
        const value = formData.get(name);
        return typeof value === "string" ? value : undefined;
    };
    return { firstArea: text("firstArea"), firstItem: text("firstItem"), firstPriority: text("firstPriority") };
}

type FieldName = "title" | "propertyId" | "unitId" | "contractorId" | "notes" | "dueDate" | "firstArea" | "firstItem";

export type WorkOrderFormState = {
    // A problem with the whole form, such as a work order that can no longer be edited.
    error?: string;
    errors?: Partial<Record<FieldName, string[]>>;
    // What was sent, to refill the form after a failed save (React resets it after each submit).
    values?: Record<string, string>;
};

// Reads the submitted form into the schema's input shape. Unchecked checkboxes aren't sent at all.
export function readWorkOrderFormData(formData: FormData): z.input<typeof workOrderFormInput> {
    const text = (name: string) => {
        const value = formData.get(name);
        return typeof value === "string" ? value : undefined;
    };
    return {
        title: text("title") ?? "",
        propertyId: text("propertyId"),
        unitId: text("unitId"),
        contractorId: text("contractorId"),
        notes: text("notes"),
        dueDate: text("dueDate"),
        notifyTenant: formData.get("tenant") === "on",
    };
}

// The submitted values as strings, for refilling the form.
export function submittedValues(formData: FormData): Record<string, string> {
    const values: Record<string, string> = {};
    for (const [name, value] of formData.entries()) {
        if (typeof value === "string" && !name.startsWith("$ACTION")) values[name] = value;
    }
    return values;
}
