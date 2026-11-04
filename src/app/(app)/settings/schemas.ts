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

export const apiKeyNameInput = z.object({
    name: z.string().trim().min(1, "Enter a name for this key").max(60),
});

export const revokeApiKeyInput = z.object({
    id: z.string().min(1),
});

// `key` is the full key, returned only by the create that made it.
export type ApiKeyFormState = {
    key?: string;
    error?: string;
    errors?: Partial<Record<keyof z.input<typeof apiKeyNameInput>, string[]>>;
    name?: string;
};
