"use server";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { OPEN_STATUSES } from "@/lib/workOrders";
import { DELETE_NOT_CONFIRMED, isDeleteConfirmed } from "@/lib/confirmDelete";
import { revokeContractorSessions } from "@/lib/contractorAccess";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { contactFormInput, contactInput, type ContactFormState } from "./schemas";

type ActionResult = { ok: true } | { ok: false; error: string };

// Sent back with errors so the form can refill what the user typed.
function submittedValues(formData: FormData) {
    const values: Record<string, string> = {};
    for (const key of Object.keys(contactInput.shape)) {
        const value = formData.get(key);
        if (typeof value === "string") values[key] = value;
    }
    return values;
}

async function readContactForm(formData: FormData, organizationId: string) {
    // A checkbox sends "on" when ticked and nothing otherwise.
    const parsed = contactFormInput.safeParse({
        ...Object.fromEntries(formData),
        inHouse: formData.get("inHouse") === "on",
    });
    if (!parsed.success) {
        const state: ContactFormState = {
            errors: z.flattenError(parsed.error).fieldErrors,
            values: submittedValues(formData),
        };
        return { ok: false as const, state };
    }

    const fields = parsed.data;
    const unitId = fields.contactType === "TENANT" ? fields.unitId : null;

    if (unitId) {
        const unit = await prisma.unit.findFirst({
            where: { id: unitId, organizationId, archived: false, property: { archived: false } },
        });
        if (!unit) {
            const state: ContactFormState = {
                errors: { propertyId: ["That unit is no longer available. Choose another."] },
                values: submittedValues(formData),
            };
            return { ok: false as const, state };
        }
    }

    // Tenants are never in-house; only contractors and other contacts can be.
    const inHouse = fields.contactType !== "TENANT" && fields.inHouse;
    return { ok: true as const, fields: { ...fields, unitId, inHouse } };
}

async function findContact(contactId: string) {
    const result = await getCurrentUser();
    if (result.state !== "ready") throw new Error("Not authorized");

    const contact = await prisma.contact.findFirst({
        where: { id: contactId, organizationId: result.organization.id },
    });
    if (!contact) throw new Error("Invalid contact");

    return contact;
}

function revalidateContact(contactId: string) {
    revalidatePath("/contacts");
    revalidatePath(`/contacts/${contactId}`);
}

export async function createContact(prevState: ContactFormState, formData: FormData): Promise<ContactFormState> {
    const result = await getCurrentUser();

    if (result.state !== "ready") {
        throw new Error("Not authorized");
    }

    const form = await readContactForm(formData, result.organization.id);
    if (!form.ok) return form.state;

    // New tenants need a unit; editing allows "No property".
    if (form.fields.contactType === "TENANT" && !form.fields.unitId) {
        const errors = formData.get("propertyId")
            ? { unitId: ["Choose a unit"] }
            : { propertyId: ["Choose a property"] };
        return { errors, values: submittedValues(formData) };
    }

    const contact = await prisma.contact.create({
        data: { organizationId: result.organization.id, ...form.fields },
    });
    revalidatePath("/contacts");
    // Added from the work order form: go back to it with this contact picked (tenants can't be picked there).
    if (formData.get("returnTo") === "/work-orders/new" && contact.contactType !== "TENANT") {
        redirect(`/work-orders/new?contractorId=${contact.id}&flash=contact-created`);
    }
    redirect(`/contacts/${contact.id}?flash=contact-created`);
}

export async function updateContact(
    contactId: string,
    prevState: ContactFormState,
    formData: FormData,
): Promise<ContactFormState> {
    const contact = await findContact(contactId);
    if (contact.archived) {
        return { error: "Restore this contact before editing it.", values: submittedValues(formData) };
    }

    const form = await readContactForm(formData, contact.organizationId);
    if (!form.ok) return form.state;
    const fields = form.fields;

    if (fields.contactType !== contact.contactType && (await workOrderCount(contactId)) > 0) {
        return {
            errors: { contactType: ["This contact is on work orders, so its type can't change."] },
            values: submittedValues(formData),
        };
    }

    const snapshot = { name: fields.displayName, phone: fields.phone, email: fields.email };
    const openWorkOrders = { organizationId: contact.organizationId, archived: false, status: { in: OPEN_STATUSES } };

    await prisma.$transaction([
        prisma.contact.update({ where: { id: contactId }, data: fields }),
        prisma.workOrder.updateMany({
            where: { ...openWorkOrders, contractorId: contactId },
            data: {
                contractorName: snapshot.name,
                contractorPhone: snapshot.phone,
                contractorEmail: snapshot.email,
            },
        }),
        prisma.workOrder.updateMany({
            where: { ...openWorkOrders, tenantId: contactId },
            data: { tenantName: snapshot.name, tenantPhone: snapshot.phone, tenantEmail: snapshot.email },
        }),
    ]);

    revalidateContact(contactId);
    revalidatePath("/work-orders");
    redirect(`/contacts/${contactId}?flash=contact-saved`);
}

function workOrderCount(contactId: string) {
    return prisma.workOrder.count({
        where: { OR: [{ contractorId: contactId }, { tenantId: contactId }] },
    });
}

// A removed contractor would leave open jobs unassigned while their link still works.
async function openWorkOrdersError(contact: { id: string; displayName: string }) {
    const openCount = await prisma.workOrder.count({
        where: { contractorId: contact.id, archived: false, status: { in: OPEN_STATUSES } },
    });
    if (openCount === 0) return null;

    const noun = openCount === 1 ? "work order" : "work orders";
    return `${contact.displayName} has ${openCount} open ${noun}. Reassign, close or cancel ${openCount === 1 ? "it" : "them"} first.`;
}

export async function deleteContact(contactId: string, confirmation: string): Promise<ActionResult> {
    if (!isDeleteConfirmed(confirmation)) return DELETE_NOT_CONFIRMED;

    const result = await getCurrentUser();
    if (result.state !== "ready") return { ok: false, error: "Not authorized" };

    const contact = await prisma.contact.findFirst({
        where: { id: contactId, organizationId: result.organization.id },
    });
    if (!contact) return { ok: false, error: "Contact not found." };

    const blocked = await openWorkOrdersError(contact);
    if (blocked) return { ok: false, error: blocked };

    // Work orders keep their name/phone/email snapshot; only the link to the contact is cleared.
    await prisma.contact.delete({ where: { id: contactId } });

    revalidatePath("/contacts");
    revalidatePath("/work-orders");
    if (contact.unitId) revalidatePath("/properties", "layout");
    redirect("/contacts");
}

export async function archiveContact(contactId: string): Promise<ActionResult> {
    const result = await getCurrentUser();
    if (result.state !== "ready") return { ok: false, error: "Not authorized" };

    const contact = await prisma.contact.findFirst({
        where: { id: contactId, organizationId: result.organization.id, archived: false },
    });
    if (!contact) return { ok: false, error: "Contact not found." };

    const blocked = await openWorkOrdersError(contact);
    if (blocked) return { ok: false, error: blocked };

    await prisma.contact.update({ where: { id: contactId }, data: { archived: true } });

    revalidateContact(contactId);
    if (contact.unitId) revalidatePath("/properties", "layout");
    return { ok: true };
}

// Revokes every verified contractor session for the contact's email. They verify again from their next work order.
export async function signOutContractorDevices(contactId: string): Promise<ActionResult> {
    const id = z.string().min(1).max(100).safeParse(contactId);
    if (!id.success) return { ok: false, error: "Contact not found." };

    const result = await getCurrentUser();
    if (result.state !== "ready") return { ok: false, error: "Not authorized" };

    const contact = await prisma.contact.findFirst({
        where: { id: id.data, organizationId: result.organization.id },
    });
    if (!contact) return { ok: false, error: "Contact not found." };
    if (contact.contactType === "TENANT" || !contact.email) {
        return { ok: false, error: "Only contractors with an email can be signed out." };
    }

    // Sessions are keyed by email, so this signs the contractor out everywhere, not only from this organization's
    // work orders. Until that's per organization (a `Contact.contractorSignedOutAt` column, tracked in TODO), only an
    // organization that has actually sent this contractor work may do it, so a contact made up with someone's email
    // can't be used to sign them out.
    const sent = await prisma.workOrder.findFirst({
        where: { organizationId: result.organization.id, contractorId: contact.id, sentAt: { not: null } },
        select: { id: true },
    });
    if (!sent) return { ok: false, error: "This contractor hasn't been sent a work order yet." };

    await revokeContractorSessions(contact.email);

    revalidatePath(`/contacts/${contact.id}`);
    return { ok: true };
}

export async function restoreContact(contactId: string) {
    const contact = await findContact(contactId);

    const unit = contact.unitId
        ? await prisma.unit.findFirst({
              where: { id: contact.unitId, archived: false, property: { archived: false } },
          })
        : null;

    await prisma.contact.update({
        where: { id: contactId },
        data: { archived: false, unitId: unit ? unit.id : null },
    });

    revalidateContact(contactId);
    if (unit) revalidatePath("/properties", "layout");
}

export async function toggleContactFavorite(contactId: string) {
    const contact = await findContact(contactId);

    await prisma.contact.update({ where: { id: contactId }, data: { favorite: !contact.favorite } });

    revalidateContact(contactId);
}
