import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
    default: { contact: { findFirst: vi.fn(), create: vi.fn() }, workOrder: { findFirst: vi.fn() } },
}));
vi.mock("@/lib/contractorAccess", () => ({ revokeContractorSessions: vi.fn() }));

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { revokeContractorSessions } from "@/lib/contractorAccess";
import prisma from "@/lib/prisma";
import { redirect } from "next/navigation";
import { createContact, signOutContractorDevices } from "./actions";

describe("createContact", () => {
    function contractorForm(extra: Record<string, string> = {}) {
        const form = new FormData();
        const values = {
            contactType: "CONTRACTOR",
            displayName: "Hill Plumbing",
            phone: "864-555-0102",
            email: "marcus@hillplumbing.example",
            ...extra,
        };
        for (const [name, value] of Object.entries(values)) form.set(name, value);
        return form;
    }

    it("opens the new contact after saving", async () => {
        vi.mocked(prisma.contact.create).mockResolvedValue({ id: "c9", contactType: "CONTRACTOR" } as never);

        await createContact({}, contractorForm());

        expect(redirect).toHaveBeenCalledWith("/contacts/c9?flash=contact-created");
    });

    it("goes back to the new work order with the contractor picked when it came from there", async () => {
        vi.mocked(prisma.contact.create).mockResolvedValue({ id: "c9", contactType: "CONTRACTOR" } as never);

        await createContact({}, contractorForm({ returnTo: "/work-orders/new" }));

        expect(redirect).toHaveBeenCalledWith("/work-orders/new?contractorId=c9&flash=contact-created");
    });

    it("ignores any other return address", async () => {
        vi.mocked(prisma.contact.create).mockResolvedValue({ id: "c9", contactType: "CONTRACTOR" } as never);

        await createContact({}, contractorForm({ returnTo: "https://evil.example" }));

        expect(redirect).toHaveBeenCalledWith("/contacts/c9?flash=contact-created");
    });
});

function withContact(overrides: Record<string, unknown> = {}) {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue({
        id: "c1",
        organizationId: "org1",
        contactType: "CONTRACTOR",
        email: "joe@example.com",
        ...overrides,
    } as never);
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({
        state: "ready",
        user: { id: "user1" },
        organization: { id: "org1" },
        role: "USER",
    } as never);
    vi.mocked(revokeContractorSessions).mockResolvedValue(2);
    vi.mocked(prisma.workOrder.findFirst).mockResolvedValue({ id: "wo1" } as never);
    withContact();
});

describe("signOutContractorDevices", () => {
    it("revokes the contractor's sessions, scoped to the user's organization", async () => {
        expect(await signOutContractorDevices("c1")).toEqual({ ok: true });
        expect(prisma.contact.findFirst).toHaveBeenCalledWith({ where: { id: "c1", organizationId: "org1" } });
        expect(prisma.workOrder.findFirst).toHaveBeenCalledWith({
            where: { organizationId: "org1", contractorId: "c1", sentAt: { not: null } },
            select: { id: true },
        });
        expect(revokeContractorSessions).toHaveBeenCalledWith("joe@example.com");
        expect(revalidatePath).toHaveBeenCalledWith("/contacts/c1");
    });

    it("refuses when the organization never sent the contractor a work order", async () => {
        vi.mocked(prisma.workOrder.findFirst).mockResolvedValue(null);

        expect(await signOutContractorDevices("c1")).toEqual({
            ok: false,
            error: "This contractor hasn't been sent a work order yet.",
        });
        expect(revokeContractorSessions).not.toHaveBeenCalled();
    });

    it("refuses when signed out", async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({ state: "signed-out" } as never);

        expect(await signOutContractorDevices("c1")).toEqual({ ok: false, error: "Not authorized" });
        expect(revokeContractorSessions).not.toHaveBeenCalled();
    });

    it("refuses a contact from another organization", async () => {
        vi.mocked(prisma.contact.findFirst).mockResolvedValue(null);

        expect(await signOutContractorDevices("c1")).toEqual({ ok: false, error: "Contact not found." });
        expect(revokeContractorSessions).not.toHaveBeenCalled();
    });

    it.each([{ contactType: "TENANT" }, { email: null }])("refuses %o", async (overrides) => {
        withContact(overrides);

        expect(await signOutContractorDevices("c1")).toMatchObject({ ok: false });
        expect(revokeContractorSessions).not.toHaveBeenCalled();
    });
});
