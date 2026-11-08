import { z } from "zod";
import { ContactType } from "@/generated/prisma/enums";
import { email, optionalState, optionalText, optionalZip, phone, tooLong } from "@/lib/validation";

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
    phone,
    notes: optionalText(5000),
    unitId: optionalText(100),
    // An employee rather than an outside contractor; only a label. Tenants are never in-house.
    inHouse: z.boolean(),
});

export type ContactFormState = {
    error?: string;
    // propertyId isn't saved, but a tenant's missing property is reported against it.
    errors?: Partial<Record<keyof z.input<typeof contactInput> | "propertyId", string[]>>;
    values?: Record<string, string>;
};
