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
    organizationInput,
    revokeApiKeyInput,
    type ApiKeyFormState,
    type OrganizationFormState,
} from "./schemas";

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
    const result = await getCurrentUser();
    if (result.state !== "ready") throw new Error("Not authorized");

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

async function requireAdmin() {
    const result = await getCurrentUser();
    if (result.state !== "ready" || result.user.role !== "ADMIN") throw new Error("Not authorized");
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
            data: { name: parsed.data.name, prefix, keyHash, createdById: user.id, organizationId: organization.id },
        });
    } catch (error) {
        console.error("createApiKey failed", error);
        return { error: "Could not create the key. Try again.", name: parsed.data.name };
    }

    revalidatePath("/settings");
    return { key, name: parsed.data.name };
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
