"use server";

import { clerkClient } from "@clerk/nextjs/server";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { aiPreferenceInput, organizationInput, type OrganizationFormState } from "./schemas";

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
