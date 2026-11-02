import { z } from "zod";
import { optionalEmail, optionalPhone } from "@/lib/validation";

export const organizationInput = z.object({
    name: z.string().trim().min(1, "Enter an organization name").max(100),
    phone: optionalPhone,
    email: optionalEmail,
});

// The Settings switch and the dashboard prompt both submit aiEnabled=on or aiEnabled=off.
export const aiPreferenceInput = z.object({
    aiEnabled: z.enum(["on", "off"]).transform((value) => value === "on"),
});

export type OrganizationFormState = {
    ok?: boolean;
    error?: string;
    errors?: Partial<Record<keyof z.input<typeof organizationInput>, string[]>>;
    values?: Record<string, string>;
};
