import { z } from "zod";
import { ContactType } from "@/generated/prisma/enums";
import { email, optionalPhone, optionalState, optionalText, optionalZip, tooLong } from "@/lib/validation";

// Email is required (work orders and verification codes go by email); phone is optional until texting exists.
export const contactInput = z.object({
    contactType: z.enum(ContactType),
    displayName: z.string().trim().min(1, "Enter a name").max(100, tooLong(100)),
    firstName: optionalText(50),
    lastName: optionalText(50),
    company: optionalText(100),
    addressLine1: optionalText(200),
    addressLine2: optionalText(200),
    city: optionalText(100),
    state: optionalState,
    zipCode: optionalZip,
    email,
    phone: optionalPhone,
    notes: optionalText(5000),
    unitId: optionalText(100),
    // An employee rather than an outside contractor; only a label. Tenants are never in-house.
    inHouse: z.boolean(),
});

// What a contact is called when no display name is typed: the person's name, or else the company. Tenants have no
// company. Shared with the form, which shows it as the display name's placeholder.
export function suggestedDisplayName(
    first: string | null | undefined,
    last: string | null | undefined,
    company: string | null | undefined,
): string {
    return [first?.trim(), last?.trim()].filter(Boolean).join(" ") || company?.trim() || "";
}

// The contact form: the display name is an optional override, filled in from the name or company when blank.
export const contactFormInput = contactInput
    .extend({ displayName: optionalText(100) })
    .transform((contact, ctx) => {
        const displayName =
            contact.displayName ??
            suggestedDisplayName(
                contact.firstName,
                contact.lastName,
                contact.contactType === "TENANT" ? null : contact.company,
            );
        if (!displayName) {
            ctx.addIssue({
                code: "custom",
                path: ["firstName"],
                message: contact.contactType === "TENANT" ? "Enter a name" : "Enter a name or a company",
            });
            return z.NEVER;
        }
        return { ...contact, displayName };
    });

export type ContactFormState = {
    error?: string;
    // propertyId isn't saved, but a tenant's missing property is reported against it.
    errors?: Partial<Record<keyof z.input<typeof contactInput> | "propertyId", string[]>>;
    values?: Record<string, string>;
};
