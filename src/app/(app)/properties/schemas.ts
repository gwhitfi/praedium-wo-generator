import { z } from "zod";
import { PropertyType } from "@/generated/prisma/enums";
import { optionalText, state, tooLong, zip } from "@/lib/validation";

const requiredText = (max: number, blankMessage: string) =>
    z.string().trim().min(1, blankMessage).max(max, tooLong(max));

export const propertyInput = z.object({
    propertyType: z.enum(PropertyType),
    displayName: requiredText(100, "Enter a name"),
    addressLine1: requiredText(200, "Enter an address"),
    addressLine2: optionalText(200),
    city: requiredText(100, "Enter a city"),
    state,
    zipCode: zip,
    notes: optionalText(5000),
});

export const MAX_UNITS = 500;
// Matches the limit for units added later on the property page.
export const MAX_UNIT_NAME_LENGTH = 100;

export const unitList = z
    .array(
        z.object({
            name: z
                .string()
                .trim()
                .min(1, "Enter a unit name")
                .max(MAX_UNIT_NAME_LENGTH, tooLong(MAX_UNIT_NAME_LENGTH)),
        }),
    )
    .max(MAX_UNITS, `Add ${MAX_UNITS} units or fewer`)
    .superRefine((units, ctx) => {
        const seen = new Set<string>();
        for (const unit of units) {
            const key = unit.name.toLowerCase();
            if (seen.has(key)) {
                ctx.addIssue({ code: "custom", message: `"${unit.name}" has already been added.` });
                return;
            }
            seen.add(key);
        }
    });

// The form sends units as a JSON string in a hidden input. Missing or empty means no units.
export const unitsInput = z
    .string()
    .optional()
    .transform((val, ctx) => {
        if (!val) return [];
        try {
            return JSON.parse(val) as unknown;
        } catch {
            ctx.addIssue({ code: "custom", message: "The unit list couldn't be read. Try again." });
            return z.NEVER;
        }
    })
    .pipe(unitList);

export type PropertyFormState = {
    error?: string;
    errors?: Partial<Record<keyof z.input<typeof propertyInput> | "units", string[]>>;
    values?: Record<string, string>;
};
