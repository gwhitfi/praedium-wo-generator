"use server";

import { clerkClient } from "@clerk/nextjs/server";
import { generateApiKey } from "@/lib/apiKeys";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
    aiPreferenceInput,
    apiKeyNameInput,
    confirmsOrganizationName,
    deleteConfirmationInput,
    notificationPreferenceInput,
    organizationInput,
    revokeApiKeyInput,
    type ApiKeyFormState,
    type NotificationFormState,
    type OrganizationFormState,
} from "./schemas";
import { storedNotificationTypes } from "@/lib/notificationTypes";
import type { ActionResult } from "@/lib/actionResult";
import { DELETE_NOT_CONFIRMED, isDeleteConfirmed } from "@/lib/confirmDelete";
import { restoreDeadline } from "@/lib/cleanup";
import { deleteAccount, lockOrganization, notifyOrganizationDeleted, planAccountDeletion } from "@/lib/deletion";
import { officeActorName } from "@/lib/workOrderEvents";
import { after } from "next/server";

// Sent back on failure so the form can refill what the user typed.
function submittedValues(formData: FormData) {
    const values: Record<string, string> = {};
    for (const key of Object.keys(organizationInput.shape)) {
        const value = formData.get(key);
        if (typeof value === "string") values[key] = value;
    }
    return values;
}

export async function updateOrganization(
    prevState: OrganizationFormState,
    formData: FormData,
): Promise<OrganizationFormState> {
    const result = await requireAdmin();

    const parsed = organizationInput.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
        return { errors: z.flattenError(parsed.error).fieldErrors, values: submittedValues(formData) };
    }
    const { name, phone, email } = parsed.data;

    try {
        if (name !== result.organization.name) {
            const client = await clerkClient();
            await client.organizations.updateOrganization(result.organization.clerkOrgId, { name });
        }

        await prisma.organization.update({
            where: { id: result.organization.id },
            data: { name, phone, email },
        });
    } catch (error) {
        console.error("updateOrganization failed", error);
        return { error: "Could not save. Try again.", values: submittedValues(formData) };
    }

    revalidatePath("/", "layout");
    return { ok: true };
}

// Per user, not per organization: each person decides whether they see the AI work order tool.
export async function setAiPreference(formData: FormData): Promise<void> {
    const result = await getCurrentUser();
    if (result.state !== "ready") throw new Error("Not authorized");

    const parsed = aiPreferenceInput.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw new Error("Invalid AI preference");

    await prisma.user.update({
        where: { id: result.user.id },
        data: { aiEnabled: parsed.data.aiEnabled },
    });
    revalidatePath("/", "layout");
}

// Per user, like the AI switch. Applies in every organization the user belongs to.
export async function setNotificationPreferences(
    prevState: NotificationFormState,
    formData: FormData,
): Promise<NotificationFormState> {
    const result = await getCurrentUser();
    if (result.state !== "ready") throw new Error("Not authorized");

    const parsed = notificationPreferenceInput.safeParse({ types: formData.getAll("types") });
    if (!parsed.success) return { error: "Could not save. Reload the page and try again." };

    try {
        await prisma.user.update({
            where: { id: result.user.id },
            data: { notificationTypes: storedNotificationTypes(parsed.data.types) },
        });
    } catch (error) {
        console.error("setNotificationPreferences failed", error);
        return { error: "Could not save. Try again." };
    }
    revalidatePath("/", "layout");
    return { ok: true };
}

async function requireAdmin() {
    const result = await getCurrentUser();
    if (result.state !== "ready" || result.role !== "ADMIN") throw new Error("Not authorized");
    return result;
}

// Returns the full key so the form can show it once; only its hash is stored.
export async function createApiKey(prevState: ApiKeyFormState, formData: FormData): Promise<ApiKeyFormState> {
    const { user, organization } = await requireAdmin();

    const parsed = apiKeyNameInput.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
        const name = formData.get("name");
        return {
            errors: z.flattenError(parsed.error).fieldErrors,
            name: typeof name === "string" ? name : undefined,
        };
    }

    const { key, prefix, keyHash } = generateApiKey();
    try {
        await prisma.apiKey.create({
            data: {
                name: parsed.data.name,
                canChangeStatus: parsed.data.canChangeStatus,
                prefix,
                keyHash,
                createdById: user.id,
                organizationId: organization.id,
            },
        });
    } catch (error) {
        console.error("createApiKey failed", error);
        return { error: "Could not create the key. Try again.", name: parsed.data.name };
    }

    revalidatePath("/settings");
    return { key, name: parsed.data.name };
}

// What "Delete my account" would do: which organizations block it (only admin, with other members) and which go
// with it (only member). Shown in the confirmation before anything is deleted.
export async function previewAccountDeletion(): Promise<
    { ok: true; blockedBy: string[]; organizationsToDelete: string[] } | { ok: false; error: string }
> {
    const result = await getCurrentUser();
    if (result.state !== "ready") return { ok: false, error: "Not authorized" };
    try {
        const plan = await planAccountDeletion(await clerkClient(), result.user.clerkId);
        return {
            ok: true,
            blockedBy: plan.blockedBy,
            organizationsToDelete: plan.organizationsToDelete.map((organization) => organization.name),
        };
    } catch (error) {
        console.error("previewAccountDeletion failed", error);
        return { ok: false, error: "Couldn't check your organizations. Try again." };
    }
}

// Deletes the signed-in user's account (and organizations only they belong to). Confirmed by typing "yes".
export async function deleteMyAccount(rawConfirmation: string): Promise<ActionResult> {
    const confirmation = deleteConfirmationInput.safeParse(rawConfirmation);
    if (!confirmation.success || !isDeleteConfirmed(confirmation.data)) return DELETE_NOT_CONFIRMED;

    const result = await getCurrentUser();
    if (result.state !== "ready") return { ok: false, error: "Not authorized" };
    try {
        return await deleteAccount(await clerkClient(), result.user.clerkId);
    } catch (error) {
        console.error("deleteMyAccount failed", error);
        return { ok: false, error: "Couldn't delete your account. Try again." };
    }
}

// Schedules the active organization for deletion: it's locked for everyone at once, every admin is emailed, any admin
// can restore it from /setup until the restore deadline, and the cleanup job deletes it after that. Admins only;
// confirmed by typing its name.
export async function deleteOrganization(rawConfirmation: string): Promise<ActionResult> {
    const result = await getCurrentUser();
    if (result.state !== "ready" || result.role !== "ADMIN") {
        return { ok: false, error: "Only admins can delete the organization." };
    }
    const { organization } = result;
    const confirmation = deleteConfirmationInput.safeParse(rawConfirmation);
    if (!confirmation.success || !confirmsOrganizationName(confirmation.data, organization.name)) {
        return { ok: false, error: `Type "${organization.name}" to confirm.` };
    }

    const deletedAt = new Date();
    let locked: boolean;
    try {
        locked = await lockOrganization(organization.id, deletedAt);
    } catch (error) {
        console.error("deleteOrganization failed", error);
        return { ok: false, error: "Couldn't delete the organization. Try again." };
    }
    console.info(`Organization ${organization.id} scheduled for deletion by user ${result.user.id}`);

    // Only the call that locked it emails the admins, so a second click doesn't send the notice twice.
    if (locked) {
        const deletedBy = officeActorName(result.user);
        after(async () => {
            try {
                await notifyOrganizationDeleted(await clerkClient(), {
                    organization,
                    deletedBy,
                    deletedAt,
                    restoreDeadline: restoreDeadline(deletedAt),
                });
            } catch (error) {
                console.error(`Deletion notices for organization ${organization.id} failed`, error);
            }
        });
    }
    return { ok: true };
}

export async function revokeApiKey(formData: FormData): Promise<void> {
    const { organization } = await requireAdmin();

    const parsed = revokeApiKeyInput.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw new Error("Invalid API key");

    await prisma.apiKey.updateMany({
        where: { id: parsed.data.id, organizationId: organization.id, revokedAt: null },
        data: { revokedAt: new Date() },
    });
    revalidatePath("/settings");
}
