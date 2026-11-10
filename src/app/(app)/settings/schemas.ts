import { z } from "zod";
import { optionalEmail, optionalPhone } from "@/lib/validation";
import { NOTIFICATION_KEYS } from "@/lib/notificationTypes";

export const organizationInput = z.object({
    name: z.string().trim().min(1, "Enter an organization name").max(100),
    phone: optionalPhone,
    email: optionalEmail,
});

// The Settings switch and the dashboard prompt both submit aiEnabled=on or aiEnabled=off.
export const aiPreferenceInput = z.object({
    aiEnabled: z.enum(["on", "off"]).transform((value) => value === "on"),
});

// The notifications form: one checkbox per option, each named "types" with the option's key as its value.
export const notificationPreferenceInput = z.object({
    types: z.array(z.enum(NOTIFICATION_KEYS)).max(NOTIFICATION_KEYS.length),
});

export type NotificationFormState = { ok?: boolean; error?: string };

export type OrganizationFormState = {
    ok?: boolean;
    error?: string;
    errors?: Partial<Record<keyof z.input<typeof organizationInput>, string[]>>;
    values?: Record<string, string>;
};

export const apiKeyNameInput = z.object({
    name: z.string().trim().min(1, "Enter a name for this key").max(60),
    // A checkbox: "on" when ticked, missing when not.
    canChangeStatus: z
        .literal("on")
        .optional()
        .transform((value) => value === "on"),
});

export const revokeApiKeyInput = z.object({
    id: z.string().min(1),
});

// What was typed to confirm a delete.
export const deleteConfirmationInput = z.string().max(300);

// "Delete organization" asks for the organization's name, compared ignoring case and the spaces around it.
export function confirmsOrganizationName(typed: string, organizationName: string): boolean {
    return typed.trim().toLowerCase() === organizationName.trim().toLowerCase() && typed.trim() !== "";
}

// `key` is the full key, returned only by the create that made it.
export type ApiKeyFormState = {
    key?: string;
    error?: string;
    errors?: Partial<Record<keyof z.input<typeof apiKeyNameInput>, string[]>>;
    name?: string;
};
