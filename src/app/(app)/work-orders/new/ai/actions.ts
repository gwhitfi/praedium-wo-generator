"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { z } from "zod";
import { parseDescription } from "@/lib/parseDescription";
import { RATE_LIMITS, rateLimit } from "@/lib/rateLimit";
import { createDraftWorkOrder } from "@/lib/workOrderCreate";
import { contractorLookup, propertyLookup } from "@/lib/workOrderLookup";
import { confirmedDraft, type ConfirmedDraft, type ParseState } from "./schemas";

// Reads the user's description with the AI, then matches its property, unit and contractor to the
// organization's records. Nothing is saved.
export async function parseWorkOrderDescription(_prev: ParseState, formData: FormData): Promise<ParseState> {
    const result = await getCurrentUser();
    if (result.state !== "ready") return { error: "Not authorized" };
    if (result.user.aiEnabled === false) return { error: "AI is turned off in your Settings." };

    const description = z.string().safeParse(formData.get("description"));
    if (!description.success) return { error: "Describe the work first." };

    const limited = await rateLimit(`bot:${result.user.id}`, RATE_LIMITS.bot);
    if (!limited.ok) {
        return {
            error: "You've used Praedium Bot a lot in the last hour. Try again in a few minutes, or use the regular form.",
        };
    }

    const parsed = await parseDescription(description.data);
    if (!parsed.ok) return { error: parsed.error };

    const organizationId = result.organization.id;
    const { draft } = parsed;
    const [property, contractor] = await Promise.all([
        propertyLookup(organizationId, draft.propertyText, draft.unitText),
        contractorLookup(organizationId, draft.contractorText),
    ]);
    return { result: { draft, property, contractor } };
}

type CreateDraftResult = { ok: false; error: string };

// Creates a DRAFT work order from the reviewed bot draft, then opens it. Returns an error instead of throwing,
// so the review screen keeps the user's description and choices.
export async function createDraftFromBot(input: ConfirmedDraft): Promise<CreateDraftResult> {
    const result = await getCurrentUser();
    if (result.state !== "ready") return { ok: false, error: "Not authorized" };

    const parsed = confirmedDraft.safeParse(input);
    if (!parsed.success) {
        return { ok: false, error: "Some details are missing or too long. Check the work order and try again." };
    }

    const created = await createDraftWorkOrder({
        organizationId: result.organization.id,
        actor: { kind: "office", user: result.user },
        draft: parsed.data,
        source: "bot",
    });
    if (!created.ok) return created;

    revalidatePath("/work-orders");
    redirect(`/work-orders/${created.workOrder.id}`);
}
