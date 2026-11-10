import { z } from "zod";
import { US_STATE_LABELS } from "./defaults";

const PHONE_MESSAGE = "Enter a 10-digit phone number";

const digitsOnly = (val: string) => val.replace(/\D/g, "");

// A record ID passed to a Server Action. The TypeScript type is only a hint: the request can carry any value, and
// Prisma reads an object such as { not: "" } as a filter matching every row.
export const idInput = z.string().min(1).max(100);

// The ID as a string, or null when the value isn't one. Actions treat null as "not found".
export function parseId(value: unknown): string | null {
    const parsed = idInput.safeParse(value);
    return parsed.success ? parsed.data : null;
}

export const email = z.string().trim().min(1, "Enter an email").max(254).pipe(z.email());

export const phone = z
    .string()
    .trim()
    .min(1, "Enter a phone number")
    .transform(digitsOnly)
    .pipe(z.string().regex(/^1?\d{10}$/, PHONE_MESSAGE))
    .transform((digits) => digits.slice(-10));

// Empty or missing becomes null. Not built from `email`/`phone` with z.union,
// which would replace their messages with a generic "Invalid input".
export const optionalEmail = z
    .string()
    .trim()
    .max(254)
    .refine((val) => val === "" || z.email().safeParse(val).success, "Invalid email address")
    .optional()
    .transform((val) => val || null);

export const optionalPhone = z
    .string()
    .transform(digitsOnly)
    .pipe(z.string().regex(/^(1?\d{10})?$/, PHONE_MESSAGE))
    .optional()
    .transform((digits) => (digits ? digits.slice(-10) : null));

export const tooLong = (max: number): string => `Use ${max} characters or fewer`;

export const optionalText = (
    max: number,
): z.ZodPipe<z.ZodOptional<z.ZodString>, z.ZodTransform<string | null, string | undefined>> =>
    z
        .string()
        .trim()
        .max(max, tooLong(max))
        .optional()
        .transform((val) => val || null);

// Blank passes these checks so the required versions report only "Choose a state" / "Enter a zip code".
const isUsStateOrBlank = (val: string) => val === "" || Object.hasOwn(US_STATE_LABELS, val);
const ZIP_PATTERN = /^(\d{5}(-\d{4})?)?$/;
const ZIP_MESSAGE = "Enter a 5-digit zip code";

export const state = z
    .string()
    .trim()
    .toUpperCase()
    .min(1, "Choose a state")
    .refine(isUsStateOrBlank, "Choose a US state");

export const optionalState = z
    .string()
    .trim()
    .toUpperCase()
    .refine(isUsStateOrBlank, "Choose a US state")
    .optional()
    .transform((val) => val || null);

export const zip = z.string().trim().min(1, "Enter a zip code").regex(ZIP_PATTERN, ZIP_MESSAGE);

export const optionalZip = z
    .string()
    .trim()
    .regex(ZIP_PATTERN, ZIP_MESSAGE)
    .optional()
    .transform((val) => val || null);
