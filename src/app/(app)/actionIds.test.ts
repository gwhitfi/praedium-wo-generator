// Every office Server Action must refuse an ID that isn't a plain string before it touches the database. A Server
// Action's arguments come from the request, and Prisma reads an object such as { not: "" } as a filter matching
// every row (finding N-1 in _docs/REVIEW-2026-11-10.md). A new exported action fails here until it is listed below.
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaCalls = vi.hoisted(() => [] as string[]);

// Records every use of the client: a property read (prisma.workOrder) or a call (findFirst(...), $transaction(...)).
vi.mock("@/lib/prisma", () => {
    const handler: ProxyHandler<() => void> = {
        get(_target, prop) {
            if (typeof prop === "symbol" || prop === "then") return undefined;
            prismaCalls.push(prop);
            return new Proxy(() => {}, handler);
        },
        apply() {
            prismaCalls.push("()");
            return new Proxy(() => {}, handler);
        },
    };
    return { default: new Proxy(() => {}, handler) };
});
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/emails/notifyCancelled", () => ({ notifyContractorsCancelled: vi.fn() }));
vi.mock("@/lib/emails/notifyTenant", () => ({ notifyTenant: vi.fn(() => false) }));
vi.mock("@/lib/storage", () => ({ deleteFiles: vi.fn(), lineItemPhotoKey: vi.fn(), uploadFile: vi.fn() }));
vi.mock("@/lib/attachments", () => ({ attachmentKeys: vi.fn(), onWorkOrders: vi.fn() }));
vi.mock("@/lib/workOrderEvents", () => ({ logEvent: vi.fn(), logEvents: vi.fn() }));
vi.mock("@/lib/workOrderStart", () => ({ startInHouseWorkOrder: vi.fn() }));
vi.mock("@/lib/workOrderSend", () => ({ emailWorkOrderToContractor: vi.fn() }));
vi.mock("@/lib/contractorAccess", () => ({ revokeContractorSessions: vi.fn() }));
vi.mock("@/lib/workOrderCreate", () => ({
    contractorSnapshot: vi.fn(),
    findTenant: vi.fn(),
    nextJobNumber: vi.fn(),
    tenantSnapshot: vi.fn(),
}));

import { getCurrentUser } from "@/lib/auth";
import * as contactActions from "./contacts/actions";
import * as propertyActions from "./properties/actions";
import * as workOrderActions from "./work-orders/actions";

// Each exported action: how to call it with `bad` in each ID position, or null when it takes no ID.
type Calls = (bad: unknown) => unknown[][];
type ActionTable = Record<string, Calls | null>;

const form = () => new FormData();
const YES = "yes"; // passes isDeleteConfirmed, so a refusal can only come from the ID check

const workOrderTable: ActionTable = {
    setSplitView: null,
    setColorSections: null,
    createWorkOrder: null,
    updateWorkOrder: (bad) => [[bad, {}, form()]],
    archiveWorkOrder: (bad) => [[bad]],
    restoreWorkOrder: (bad) => [[bad]],
    deleteWorkOrder: (bad) => [[bad, YES]],
    addArea: (bad) => [[bad, "Kitchen"]],
    removeArea: (bad) => [[bad]],
    renameArea: (bad) => [[bad, "Kitchen"]],
    moveArea: (bad) => [[bad, "up"]],
    addLineItem: (bad) => [[bad, "Fix the sink", "MEDIUM"]],
    removeLineItem: (bad) => [[bad]],
    moveLineItem: (bad) => [[bad, "up"]],
    updateLineItem: (bad) => [[bad, "Fix the sink", "MEDIUM"]],
    addLineItemPhoto: (bad) => [[bad, form()]],
    removeLineItemPhoto: (bad) => [[bad]],
    sendWorkOrder: (bad) => [[bad, "EMAIL"]],
    emailWorkOrder: (bad) => [[bad]],
    startWorkOrder: (bad) => [[bad]],
    setLineItemCompleted: (bad) => [[bad, true]],
    markWorkOrderCompleted: (bad) => [[bad]],
    reopenWorkOrder: (bad) => [[bad]],
    closeWorkOrder: (bad) => [[bad]],
    cancelWorkOrder: (bad) => [[bad, "No longer needed"]],
    regeneratePublicToken: (bad) => [[bad]],
};

const propertyTable: ActionTable = {
    setGroupByType: null,
    createProperty: null,
    updateProperty: (bad) => [[bad, {}, form()]],
    archiveProperty: (bad) => [[bad]],
    restoreProperty: (bad) => [[bad]],
    togglePropertyFavorite: (bad) => [[bad]],
    deleteProperty: (bad) => [[bad, YES]],
    addUnit: (bad) => [[bad, "2B"]],
    renameUnit: (bad) => [[bad, "2B"]],
    archiveUnit: (bad) => [[bad]],
    deleteUnit: (bad) => [[bad, YES]],
};

const contactTable: ActionTable = {
    createContact: null,
    updateContact: (bad) => [[bad, {}, form()]],
    deleteContact: (bad) => [[bad, YES]],
    archiveContact: (bad) => [[bad]],
    signOutContractorDevices: (bad) => [[bad]],
    restoreContact: (bad) => [[bad]],
    toggleContactFavorite: (bad) => [[bad]],
};

const modules: { name: string; actions: Record<string, unknown>; table: ActionTable }[] = [
    { name: "work-orders", actions: workOrderActions, table: workOrderTable },
    { name: "properties", actions: propertyActions, table: propertyTable },
    { name: "contacts", actions: contactActions, table: contactTable },
];

// Values Prisma would read as a filter instead of an ID. Each is wrapped in its own row so it.each passes it as is
// (it spreads a row that is an array).
const BAD_IDS: [unknown][] = [[{ not: "" }], [{ in: [] }], [["id"]], [1]];

function exportedFunctions(actions: Record<string, unknown>): string[] {
    return Object.keys(actions)
        .filter((key) => typeof actions[key] === "function")
        .sort();
}

// True when the action refused: it threw, or returned { ok: false }.
async function refused(action: (...args: unknown[]) => Promise<unknown>, args: unknown[]): Promise<boolean> {
    try {
        const result = await action(...args);
        return typeof result === "object" && result !== null && "ok" in result && result.ok === false;
    } catch {
        return true;
    }
}

beforeEach(() => {
    prismaCalls.length = 0;
    vi.mocked(getCurrentUser).mockResolvedValue({
        state: "ready",
        user: { id: "user_1", name: "Office User" },
        organization: { id: "org_1", name: "Org" },
        role: "ADMIN",
    } as unknown as Awaited<ReturnType<typeof getCurrentUser>>);
});

describe.each(modules)("$name actions", ({ actions, table }) => {
    it("lists every exported action, so a new one has to declare its ID arguments", () => {
        expect(exportedFunctions(actions)).toEqual(Object.keys(table).sort());
    });

    const withIds = Object.entries(table).filter((entry): entry is [string, Calls] => entry[1] !== null);

    describe.each(withIds)("%s", (name, calls) => {
        it.each(BAD_IDS)("refuses %j as an ID before any database call", async (bad) => {
            const action = actions[name] as (...args: unknown[]) => Promise<unknown>;
            for (const args of calls(bad)) {
                expect(await refused(action, args)).toBe(true);
                expect(prismaCalls).toEqual([]);
            }
        });
    });
});
