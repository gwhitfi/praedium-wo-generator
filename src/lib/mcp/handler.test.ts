import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
    default: {
        apiKey: { findFirst: vi.fn(), update: vi.fn() },
        property: { findMany: vi.fn() },
        contact: { findMany: vi.fn() },
    },
}));

vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/workOrderCreate", () => ({ createDraftWorkOrder: vi.fn() }));
vi.mock("./workOrders", () => ({ listWorkOrders: vi.fn(), getWorkOrder: vi.fn(), listActivity: vi.fn() }));
vi.mock("./records", async (importOriginal) => ({
    ...(await importOriginal<typeof import("./records")>()),
    createProperty: vi.fn(),
    createContact: vi.fn(),
    searchContacts: vi.fn(),
    getProperty: vi.fn(),
    getContact: vi.fn(),
    addUnit: vi.fn(),
    updateProperty: vi.fn(),
    updateContact: vi.fn(),
}));
vi.mock("./workOrderEdit", async (importOriginal) => ({
    ...(await importOriginal<typeof import("./workOrderEdit")>()),
    updateWorkOrder: vi.fn(),
    addLineItem: vi.fn(),
    updateLineItem: vi.fn(),
    removeLineItem: vi.fn(),
    removeArea: vi.fn(),
    renameArea: vi.fn(),
    moveArea: vi.fn(),
    moveLineItem: vi.fn(),
}));
vi.mock("./status", async (importOriginal) => ({
    ...(await importOriginal<typeof import("./status")>()),
    sendWorkOrder: vi.fn(),
    cancelWorkOrder: vi.fn(),
    archiveWorkOrder: vi.fn(),
    restoreWorkOrder: vi.fn(),
}));
vi.mock("@/lib/rateLimit", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/rateLimit")>()),
    rateLimit: vi.fn(),
}));

import prisma from "@/lib/prisma";
import { generateApiKey } from "@/lib/apiKeys";
import { rateLimit } from "@/lib/rateLimit";
import { createDraftWorkOrder } from "@/lib/workOrderCreate";
import { assistantGuide } from "./guide";
import { authFailureReason, bearerToken, handleMcpRequest } from "./handler";
import { createContact, createProperty, getProperty, searchContacts, updateContact } from "./records";
import { cancelWorkOrder, sendWorkOrder } from "./status";
import { MISSING_CREATOR_ERROR } from "./tools";
import { addLineItem, moveLineItem, removeArea, updateWorkOrder } from "./workOrderEdit";
import { getWorkOrder, listActivity, listWorkOrders } from "./workOrders";

const { key } = generateApiKey();

function mcpRequest(body: unknown, headers: Record<string, string> = { authorization: `Bearer ${key}` }): Request {
    return new Request("http://localhost/api/mcp", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
        body: JSON.stringify(body),
    });
}

// The response is either plain JSON or a single SSE `data:` frame, depending on the transport's choice.
async function rpcResult(response: Response): Promise<{ result?: Record<string, unknown>; error?: unknown }> {
    const text = await response.text();
    const data = text.startsWith("{")
        ? text
        : text
              .split("\n")
              .find((line) => line.startsWith("data: "))
              ?.slice(6);
    return JSON.parse(data ?? "null");
}

const initialize = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1.0.0" } },
};

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.apiKey.findFirst).mockResolvedValue({
        id: "key1",
        organization: { id: "org1" },
        createdBy: { id: "user1" },
        canChangeStatus: false,
    } as never);
    vi.mocked(prisma.apiKey.update).mockResolvedValue({} as never);
    vi.mocked(rateLimit).mockResolvedValue({ ok: true, remaining: 1, retryAfterSeconds: 0 });
});

describe("bearerToken", () => {
    it("reads a bearer token from the Authorization header", () => {
        const request = (value: string) => new Request("http://localhost", { headers: { authorization: value } });
        expect(bearerToken(request("Bearer pr_abc"))).toBe("pr_abc");
        expect(bearerToken(request("bearer  pr_abc "))).toBe("pr_abc");
        expect(bearerToken(request("Basic pr_abc"))).toBeNull();
        expect(bearerToken(request("Bearer"))).toBeNull();
        expect(bearerToken(new Request("http://localhost"))).toBeNull();
    });
});

describe("authFailureReason", () => {
    const request = (value?: string) => new Request("http://localhost", value === undefined ? {} : { headers: { authorization: value } });
    it("names the problem without revealing the key", () => {
        expect(authFailureReason(request(), null)).toBe("no Authorization header");
        expect(authFailureReason(request("Basic abc"), null)).toContain('does not start with "Bearer"');
        expect(authFailureReason(request("Bearer Bearer pr_abc"), null)).toContain("followed by 2 words");
        expect(authFailureReason(request("Bearer abc"), "abc")).toContain("does not start with pr_");
        expect(authFailureReason(request("Bearer pr_short"), "pr_short")).toContain("pr_ + 5 chars, expected 43");
        const reason = authFailureReason(request(`Bearer ${key}`), key);
        expect(reason).toBe(`unknown or revoked key (prefix ${key.slice(3, 11)})`);
        expect(reason).not.toContain(key);
    });
});

describe("handleMcpRequest auth gate", () => {
    it("logs why a request was refused, with the key prefix only", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        try {
            await handleMcpRequest(mcpRequest(initialize, {}));
            expect(warn).toHaveBeenLastCalledWith("MCP auth refused", expect.objectContaining({ reason: "no Authorization header", method: "POST" }));
            vi.mocked(prisma.apiKey.findFirst).mockResolvedValue(null);
            await handleMcpRequest(mcpRequest(initialize));
            const [, details] = warn.mock.calls.at(-1)!;
            expect(details).toMatchObject({ reason: `unknown or revoked key (prefix ${key.slice(3, 11)})` });
            expect(JSON.stringify(details)).not.toContain(key);
        } finally {
            warn.mockRestore();
        }
    });


    it("returns 401 JSON without a key, without touching the database", async () => {
        const response = await handleMcpRequest(mcpRequest(initialize, {}));
        expect(response.status).toBe(401);
        expect(response.headers.get("www-authenticate")).toContain("Bearer");
        expect(await response.json()).toEqual({ error: expect.stringContaining("API key") });
        expect(prisma.apiKey.findFirst).not.toHaveBeenCalled();
    });

    it("returns 401 for an unknown or revoked key", async () => {
        vi.mocked(prisma.apiKey.findFirst).mockResolvedValue(null);
        const response = await handleMcpRequest(mcpRequest(initialize));
        expect(response.status).toBe(401);
    });

    it("answers initialize with a valid key, with instructions that depend on the key's permission", async () => {
        const response = await handleMcpRequest(mcpRequest(initialize));
        expect(response.status).toBe(200);
        const { result } = await rpcResult(response);
        expect(result?.serverInfo).toMatchObject({ name: "praedium" });
        expect(result?.instructions).toEqual(expect.stringContaining("search_contacts"));
        expect(result?.instructions).toEqual(expect.stringContaining("can't send"));

        withStatusKey();
        const withStatus = await rpcResult(await handleMcpRequest(mcpRequest(initialize)));
        expect(withStatus.result?.instructions).toEqual(expect.stringContaining("send_work_order"));
    });
});

describe("handleMcpRequest rate limits", () => {
    const overLimit = { ok: false, remaining: 0, retryAfterSeconds: 42 };

    it("returns 429 with Retry-After when a valid key is over its limit", async () => {
        vi.mocked(rateLimit).mockResolvedValue(overLimit);
        const response = await handleMcpRequest(mcpRequest(initialize));
        expect(response.status).toBe(429);
        expect(response.headers.get("retry-after")).toBe("42");
        expect(await response.json()).toEqual({ error: expect.stringContaining("Too many requests") });
        expect(vi.mocked(rateLimit).mock.calls[0][0]).toMatch(/^mcp:/);
    });

    it("still returns 401 for a missing key under the failure limit", async () => {
        const response = await handleMcpRequest(mcpRequest(initialize, {}));
        expect(response.status).toBe(401);
    });

    it("returns 429 for a missing key over the failure limit, bucketed by the first forwarded IP", async () => {
        vi.mocked(rateLimit).mockResolvedValue(overLimit);
        const response = await handleMcpRequest(mcpRequest(initialize, { "x-forwarded-for": "203.0.113.7, 10.0.0.1" }));
        expect(response.status).toBe(429);
        expect(response.headers.get("retry-after")).toBe("42");
        expect(vi.mocked(rateLimit).mock.calls[0][0]).toBe("mcp-auth:203.0.113.7");
    });

    it("buckets a valid key by its hash, not the key itself", async () => {
        await handleMcpRequest(mcpRequest(initialize));
        const bucket = vi.mocked(rateLimit).mock.calls[0][0];
        expect(bucket).toMatch(/^mcp:/);
        expect(bucket).not.toContain(key);
    });
});

// The key verifyApiKey finds, with the status permission on.
function withStatusKey(createdBy: unknown = { id: "user1" }) {
    vi.mocked(prisma.apiKey.findFirst).mockResolvedValue({
        id: "key1",
        organization: { id: "org1", name: "Acme Property", phone: null, email: null },
        createdBy,
        canChangeStatus: true,
    } as never);
}

type ListedTool = { name: string; annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean } };

async function listTools(): Promise<ListedTool[]> {
    const response = await handleMcpRequest(mcpRequest({ jsonrpc: "2.0", id: 2, method: "tools/list" }));
    const { result } = await rpcResult(response);
    return result?.tools as ListedTool[];
}

const BASE_TOOLS = [
    "add_line_item",
    "add_unit",
    "create_contact",
    "create_draft_work_order",
    "create_property",
    "get_contact",
    "get_property",
    "get_work_order",
    "list_activity",
    "list_work_orders",
    "move_area",
    "move_line_item",
    "remove_area",
    "remove_line_item",
    "rename_area",
    "search_contacts",
    "search_properties",
    "update_contact",
    "update_line_item",
    "update_property",
    "update_work_order",
];
const STATUS_TOOLS = [
    "archive_work_order",
    "cancel_work_order",
    "restore_work_order",
    "send_work_order",
    "start_work_order",
];

describe("search_properties over MCP", () => {
    it("lists every tool, marking the reads read-only and only the removes and cancel destructive", async () => {
        const tools = await listTools();
        const reads = [
            "get_contact",
            "get_property",
            "get_work_order",
            "list_activity",
            "list_work_orders",
            "search_contacts",
            "search_properties",
        ];
        const destructive = ["cancel_work_order", "remove_area", "remove_line_item"];
        expect(tools.map((tool) => tool.name).sort()).toEqual(BASE_TOOLS);

        withStatusKey();
        const withStatus = await listTools();
        expect(withStatus.map((tool) => tool.name).sort()).toEqual([...BASE_TOOLS, ...STATUS_TOOLS].sort());
        for (const tool of withStatus) {
            expect(tool.annotations?.readOnlyHint, tool.name).toBe(reads.includes(tool.name) ? true : undefined);
            expect(tool.annotations?.destructiveHint, tool.name).toBe(
                destructive.includes(tool.name) ? true : undefined,
            );
        }
    });

    it("searches only the key's organization and returns compact JSON", async () => {
        const maple = {
            id: "prop1",
            displayName: "Maple Duplex",
            addressLine1: "123 Maple St",
            city: "Greenville",
            units: [{ id: "unit1", name: "A", isDefault: true }],
        };
        vi.mocked(prisma.property.findMany).mockResolvedValue([maple] as never);

        const response = await handleMcpRequest(
            mcpRequest({
                jsonrpc: "2.0",
                id: 3,
                method: "tools/call",
                params: { name: "search_properties", arguments: { query: "123 Maple St" } },
            }),
        );
        const { result } = await rpcResult(response);
        const content = result?.content as { type: string; text: string }[];
        expect(JSON.parse(content[0].text)).toEqual({ status: "matched", match: maple });
        expect(vi.mocked(prisma.property.findMany).mock.calls[0][0]).toMatchObject({
            where: { organizationId: "org1", archived: false },
        });
    });
});

function callTool(name: string, args: unknown): Request {
    return mcpRequest({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name, arguments: args } });
}

type ToolResult = { content: { type: string; text: string }[]; isError?: boolean };

async function toolResult(response: Response): Promise<ToolResult> {
    const { result, error } = await rpcResult(response);
    if (!result) throw new Error(`No result: ${JSON.stringify(error)}`);
    return result as ToolResult;
}

const draft = {
    propertyId: "prop1",
    unitId: "unit1",
    contractorId: null,
    title: "  Fix leak  ",
    notes: "   ",
    dueDate: "2026-11-20",
    areas: [{ name: "Kitchen", lineItems: [{ description: "Replace trap", priority: "HIGH" }] }],
};

describe("create_draft_work_order over MCP", () => {
    it("creates a draft as the key's creator and returns its id, job number, status and link", async () => {
        vi.stubEnv("APP_URL", "https://app.example.com/");
        const creator = { id: "user1", firstName: "Justin", lastName: "W", email: "j@example.com" };
        vi.mocked(prisma.apiKey.findFirst).mockResolvedValue({
            id: "key1",
            organization: { id: "org1" },
            createdBy: creator,
        } as never);
        vi.mocked(createDraftWorkOrder).mockResolvedValue({
            ok: true,
            workOrder: { id: "wo1", jobNumber: "2026-1042" },
        });

        const result = await toolResult(await handleMcpRequest(callTool("create_draft_work_order", draft)));

        expect(result.isError).toBeFalsy();
        expect(JSON.parse(result.content[0].text)).toEqual({
            id: "wo1",
            jobNumber: "2026-1042",
            status: "DRAFT",
            url: "https://app.example.com/work-orders/wo1",
        });
        expect(createDraftWorkOrder).toHaveBeenCalledWith({
            organizationId: "org1",
            actor: { kind: "office", user: creator },
            draft: { ...draft, title: "Fix leak", notes: null, inHouse: false },
            source: "mcp",
        });
        vi.unstubAllEnvs();
    });

    it("treats left-out unitId, contractorId, notes and dueDate as null, and inHouse as false", async () => {
        vi.stubEnv("APP_URL", "");
        vi.mocked(createDraftWorkOrder).mockResolvedValue({
            ok: true,
            workOrder: { id: "wo1", jobNumber: "2026-1042" },
        });
        const minimal = { propertyId: "prop1", title: "Fix leak", areas: draft.areas };

        const result = await toolResult(await handleMcpRequest(callTool("create_draft_work_order", minimal)));

        expect(result.isError).toBeFalsy();
        expect(createDraftWorkOrder).toHaveBeenCalledWith(
            expect.objectContaining({
                draft: { ...minimal, unitId: null, contractorId: null, inHouse: false, notes: null, dueDate: null },
            }),
        );
        vi.unstubAllEnvs();
    });

    it("returns the path alone when APP_URL isn't set", async () => {
        vi.stubEnv("APP_URL", "");
        vi.mocked(createDraftWorkOrder).mockResolvedValue({
            ok: true,
            workOrder: { id: "wo1", jobNumber: "2026-1042" },
        });
        const result = await toolResult(await handleMcpRequest(callTool("create_draft_work_order", draft)));
        expect(JSON.parse(result.content[0].text)).toMatchObject({ url: "/work-orders/wo1" });
        vi.unstubAllEnvs();
    });

    it("refuses with a tool error when the key's creator was deleted, while reads still work", async () => {
        vi.mocked(prisma.apiKey.findFirst).mockResolvedValue({
            id: "key1",
            organization: { id: "org1" },
            createdBy: null,
        } as never);

        const result = await toolResult(await handleMcpRequest(callTool("create_draft_work_order", draft)));
        expect(result).toEqual({ content: [{ type: "text", text: MISSING_CREATOR_ERROR }], isError: true });
        expect(createDraftWorkOrder).not.toHaveBeenCalled();

        vi.mocked(listWorkOrders).mockResolvedValue([]);
        const list = await toolResult(await handleMcpRequest(callTool("list_work_orders", {})));
        expect(list.isError).toBeFalsy();
    });

    it("passes on createDraftWorkOrder's error as a tool error", async () => {
        vi.mocked(createDraftWorkOrder).mockResolvedValue({
            ok: false,
            error: "That property wasn't found. Choose it again.",
        });
        const result = await toolResult(await handleMcpRequest(callTool("create_draft_work_order", draft)));
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("property wasn't found");
    });

    it("rejects a draft that fails confirmedDraft without creating anything", async () => {
        const result = await toolResult(
            await handleMcpRequest(callTool("create_draft_work_order", { ...draft, areas: [] })),
        );
        expect(result.isError).toBe(true);
        expect(createDraftWorkOrder).not.toHaveBeenCalled();
    });
});

describe("work order reads over MCP", () => {
    it("lists the key's organization's work orders with the default limit", async () => {
        const row = { id: "wo1", jobNumber: "2026-1001", status: "DRAFT", title: "Fix leak" };
        vi.mocked(listWorkOrders).mockResolvedValue([row] as never);

        const result = await toolResult(
            await handleMcpRequest(callTool("list_work_orders", { status: "DRAFT", query: " leak " })),
        );
        expect(JSON.parse(result.content[0].text)).toEqual([row]);
        expect(listWorkOrders).toHaveBeenCalledWith("org1", {
            status: "DRAFT",
            query: "leak",
            includeArchived: false,
            limit: 20,
        });
    });

    it("rejects a limit over 50 and an unknown status", async () => {
        for (const args of [{ limit: 51 }, { status: "OPEN" }]) {
            const result = await toolResult(await handleMcpRequest(callTool("list_work_orders", args)));
            expect(result.isError).toBe(true);
        }
        expect(listWorkOrders).not.toHaveBeenCalled();
    });

    it("gets one work order of the key's organization with its link", async () => {
        vi.mocked(getWorkOrder).mockResolvedValue({ id: "wo1", jobNumber: "2026-1001" } as never);
        const result = await toolResult(await handleMcpRequest(callTool("get_work_order", { id: "wo1" })));
        expect(JSON.parse(result.content[0].text)).toMatchObject({
            id: "wo1",
            url: expect.stringMatching(/\/work-orders\/wo1$/),
        });
        expect(getWorkOrder).toHaveBeenCalledWith("org1", "wo1");
    });

    it("returns a tool error when the work order isn't in the organization", async () => {
        vi.mocked(getWorkOrder).mockResolvedValue(null);
        const result = await toolResult(await handleMcpRequest(callTool("get_work_order", { id: "other-org-wo" })));
        expect(result).toEqual({
            content: [{ type: "text", text: "No work order with that id was found." }],
            isError: true,
        });
    });
});

describe("write tools over MCP", () => {
    const creator = { id: "user1", firstName: "Justin", lastName: "W", email: "j@example.com" };

    beforeEach(() => {
        vi.stubEnv("APP_URL", "https://app.example.com");
        vi.mocked(prisma.apiKey.findFirst).mockResolvedValue({
            id: "key1",
            organization: { id: "org1" },
            createdBy: creator,
        } as never);
        return () => vi.unstubAllEnvs();
    });

    it("creates a property in the key's organization and returns its units and link", async () => {
        const created = { id: "prop1", displayName: "Maple Duplex", units: [{ id: "u1", name: "Main" }] };
        vi.mocked(createProperty).mockResolvedValue(created);
        const input = {
            propertyType: "DUPLEX",
            displayName: "Maple Duplex",
            addressLine1: "123 Maple St",
            city: "Greenville",
            state: "SC",
            zipCode: "29601",
        };

        const result = await toolResult(await handleMcpRequest(callTool("create_property", input)));

        expect(result.isError).toBeFalsy();
        expect(JSON.parse(result.content[0].text)).toEqual({
            ...created,
            url: "https://app.example.com/properties/prop1",
        });
        expect(createProperty).toHaveBeenCalledWith(
            "org1",
            expect.objectContaining({ ...input, addressLine2: null, notes: null, units: [] }),
        );
    });

    it("creates a contact and returns its link", async () => {
        vi.mocked(createContact).mockResolvedValue({
            ok: true,
            contact: { id: "c1", displayName: "Ace Electric", contactType: "CONTRACTOR" },
        });

        const result = await toolResult(
            await handleMcpRequest(
                callTool("create_contact", { contactType: "CONTRACTOR", displayName: "Ace Electric" }),
            ),
        );

        expect(JSON.parse(result.content[0].text)).toEqual({
            id: "c1",
            displayName: "Ace Electric",
            contactType: "CONTRACTOR",
            url: "https://app.example.com/contacts/c1",
        });
        expect(createContact).toHaveBeenCalledWith(
            "org1",
            expect.objectContaining({ contactType: "CONTRACTOR", email: null, phone: null, unitId: null }),
        );
    });

    it("updates a work order as the key's creator and returns what changed with its link", async () => {
        vi.mocked(updateWorkOrder).mockResolvedValue({
            ok: true,
            workOrder: { id: "wo1", jobNumber: "2026-1001", status: "SENT" },
            changed: ["title", "contractor"],
            newContractorLink: true,
        });

        const result = await toolResult(
            await handleMcpRequest(
                callTool("update_work_order", { id: "wo1", title: " New title ", contractorId: "ace" }),
            ),
        );

        expect(JSON.parse(result.content[0].text)).toEqual({
            id: "wo1",
            jobNumber: "2026-1001",
            status: "SENT",
            changed: ["title", "contractor"],
            newContractorLink: true,
            url: "https://app.example.com/work-orders/wo1",
        });
        expect(updateWorkOrder).toHaveBeenCalledWith("org1", creator, {
            id: "wo1",
            title: "New title",
            contractorId: "ace",
        });
    });

    it("returns the new line item's ids from add_line_item", async () => {
        vi.mocked(addLineItem).mockResolvedValue({
            ok: true,
            lineItem: { id: "li9", areaId: "area3", areaName: "Garage", areaCreated: true },
        });
        const input = { workOrderId: "wo1", area: "Garage", description: "Fix door", priority: "HIGH" };

        const result = await toolResult(await handleMcpRequest(callTool("add_line_item", input)));

        expect(JSON.parse(result.content[0].text)).toEqual({
            lineItemId: "li9",
            areaId: "area3",
            areaName: "Garage",
            areaCreated: true,
        });
        expect(addLineItem).toHaveBeenCalledWith("org1", creator, input);
    });

    it("refuses every write when the key's creator was deleted", async () => {
        vi.mocked(prisma.apiKey.findFirst).mockResolvedValue({
            id: "key1",
            organization: { id: "org1" },
            createdBy: null,
        } as never);

        for (const [name, args] of [
            ["update_work_order", { id: "wo1", title: "x" }],
            ["remove_area", { areaId: "area1" }],
            ["create_contact", { contactType: "OTHER", displayName: "Someone" }],
        ] as const) {
            const result = await toolResult(await handleMcpRequest(callTool(name, args)));
            expect(result, name).toEqual({ content: [{ type: "text", text: MISSING_CREATOR_ERROR }], isError: true });
        }
        expect(updateWorkOrder).not.toHaveBeenCalled();
        expect(removeArea).not.toHaveBeenCalled();
        expect(createContact).not.toHaveBeenCalled();
    });

    it("rejects invalid input without calling the helper", async () => {
        const tenant = await toolResult(
            await handleMcpRequest(callTool("create_contact", { contactType: "TENANT", displayName: "Ana Ruiz" })),
        );
        expect(tenant.isError).toBe(true);
        expect(tenant.content[0].text).toContain("unitId");
        expect(createContact).not.toHaveBeenCalled();

        const onlyId = await toolResult(await handleMcpRequest(callTool("update_work_order", { id: "wo1" })));
        expect(onlyId.isError).toBe(true);
        expect(updateWorkOrder).not.toHaveBeenCalled();
    });

    it("passes on a helper's error as a tool error", async () => {
        vi.mocked(removeArea).mockResolvedValue({
            ok: false,
            error: "Only open work orders (Draft, Sent or In progress) that aren't archived can be edited.",
        });
        const result = await toolResult(await handleMcpRequest(callTool("remove_area", { areaId: "area1" })));
        expect(result).toEqual({
            content: [
                {
                    type: "text",
                    text: "Only open work orders (Draft, Sent or In progress) that aren't archived can be edited.",
                },
            ],
            isError: true,
        });
        expect(removeArea).toHaveBeenCalledWith("org1", creator, { areaId: "area1" });
    });

    it("updates a contact and returns its link", async () => {
        vi.mocked(updateContact).mockResolvedValue({
            ok: true,
            contact: { id: "joes", displayName: "Joe's Plumbing", contactType: "CONTRACTOR" },
        });

        const result = await toolResult(
            await handleMcpRequest(callTool("update_contact", { id: "joes", phone: "(864) 555-0199" })),
        );

        expect(JSON.parse(result.content[0].text)).toEqual({
            id: "joes",
            displayName: "Joe's Plumbing",
            contactType: "CONTRACTOR",
            url: "https://app.example.com/contacts/joes",
        });
        expect(updateContact).toHaveBeenCalledWith("org1", { id: "joes", phone: "8645550199" });
    });

    it("moves a line item into another area", async () => {
        vi.mocked(moveLineItem).mockResolvedValue({ ok: true, lineItem: { id: "li1", areaId: "area2", position: 1 } });

        const result = await toolResult(
            await handleMcpRequest(callTool("move_line_item", { lineItemId: "li1", position: 1, areaId: "area2" })),
        );

        expect(JSON.parse(result.content[0].text)).toEqual({ id: "li1", areaId: "area2", position: 1 });
        expect(moveLineItem).toHaveBeenCalledWith("org1", { lineItemId: "li1", position: 1, areaId: "area2" });

        const zero = await toolResult(
            await handleMcpRequest(callTool("move_line_item", { lineItemId: "li1", position: 0 })),
        );
        expect(zero.isError).toBe(true);
        expect(moveLineItem).toHaveBeenCalledTimes(1);
    });
});

describe("new reads over MCP", () => {
    it("searches contacts by type in the key's organization", async () => {
        vi.mocked(searchContacts).mockResolvedValue({ status: "notFound" });

        const result = await toolResult(
            await handleMcpRequest(callTool("search_contacts", { query: " Joe ", type: "ASSIGNABLE" })),
        );

        expect(JSON.parse(result.content[0].text)).toEqual({ status: "notFound" });
        expect(searchContacts).toHaveBeenCalledWith("org1", { query: "Joe", type: "ASSIGNABLE" });

        const badType = await toolResult(
            await handleMcpRequest(callTool("search_contacts", { query: "Joe", type: "VENDOR" })),
        );
        expect(badType.isError).toBe(true);
    });

    it("gets a property with its link, or a tool error when it isn't the organization's", async () => {
        vi.mocked(getProperty).mockResolvedValue({ id: "prop1", displayName: "Maple Duplex" } as never);
        const found = await toolResult(await handleMcpRequest(callTool("get_property", { id: "prop1" })));
        expect(JSON.parse(found.content[0].text)).toMatchObject({
            id: "prop1",
            url: expect.stringMatching(/\/properties\/prop1$/),
        });
        expect(getProperty).toHaveBeenCalledWith("org1", "prop1");

        vi.mocked(getProperty).mockResolvedValue(null);
        const missing = await toolResult(await handleMcpRequest(callTool("get_property", { id: "other" })));
        expect(missing).toEqual({
            content: [{ type: "text", text: "No property with that id was found." }],
            isError: true,
        });
    });

    it("lists activity with the default limit and validates since and types", async () => {
        vi.mocked(listActivity).mockResolvedValue([]);

        const result = await toolResult(
            await handleMcpRequest(callTool("list_activity", { since: "2026-11-01T00:00:00Z", types: ["SENT"] })),
        );

        expect(result.isError).toBeFalsy();
        expect(listActivity).toHaveBeenCalledWith("org1", {
            since: "2026-11-01T00:00:00Z",
            types: ["SENT"],
            limit: 50,
        });

        for (const args of [{ since: "yesterday" }, { types: ["NOPE"] }, { limit: 201 }]) {
            const bad = await toolResult(await handleMcpRequest(callTool("list_activity", args)));
            expect(bad.isError).toBe(true);
        }
        expect(listActivity).toHaveBeenCalledTimes(1);
    });

    it("returns a tool error when list_activity's work order isn't the organization's", async () => {
        vi.mocked(listActivity).mockResolvedValue(null);
        const result = await toolResult(await handleMcpRequest(callTool("list_activity", { workOrderId: "other" })));
        expect(result.isError).toBe(true);
    });
});

describe("the praedium-guide prompt", () => {
    it("is listed and returns the guide for the key's permission", async () => {
        const list = await rpcResult(
            await handleMcpRequest(mcpRequest({ jsonrpc: "2.0", id: 5, method: "prompts/list" })),
        );
        expect(list.result?.prompts).toEqual([
            expect.objectContaining({ name: "praedium-guide", title: "Using Praedium" }),
        ]);

        const get = await rpcResult(
            await handleMcpRequest(
                mcpRequest({ jsonrpc: "2.0", id: 6, method: "prompts/get", params: { name: "praedium-guide" } }),
            ),
        );
        expect(get.result?.messages).toEqual([
            { role: "user", content: { type: "text", text: assistantGuide(false) } },
        ]);
    });
});

describe("status tools over MCP", () => {
    const creator = { id: "user1", firstName: "Justin", lastName: "W", email: "j@example.com" };
    const organization = { id: "org1", name: "Acme Property", phone: null, email: null };

    it("aren't callable with a key that can't change status", async () => {
        const { result, error } = await rpcResult(await handleMcpRequest(callTool("send_work_order", { id: "wo1" })));
        expect(result).toBeUndefined();
        expect(error).toMatchObject({ message: expect.stringContaining("not found") });
        expect(sendWorkOrder).not.toHaveBeenCalled();
    });

    it("send a work order as the key's creator, from the key's organization", async () => {
        withStatusKey(creator);
        const sent = {
            id: "wo1",
            jobNumber: "2026-1001",
            status: "SENT" as const,
            sentTo: "joe@example.com",
            resent: false,
            tenantNotified: false,
        };
        vi.mocked(sendWorkOrder).mockResolvedValue({ ok: true, workOrder: sent });

        const result = await toolResult(await handleMcpRequest(callTool("send_work_order", { id: "wo1" })));

        expect(JSON.parse(result.content[0].text)).toEqual(sent);
        expect(sendWorkOrder).toHaveBeenCalledWith(organization, creator, { id: "wo1" });
    });

    it("pass on a refused cancel, and refuse every status change when the creator was deleted", async () => {
        withStatusKey(creator);
        vi.mocked(cancelWorkOrder).mockResolvedValue({ ok: false, error: "Only sent or in-progress ..." });
        const refused = await toolResult(
            await handleMcpRequest(callTool("cancel_work_order", { id: "wo1", reason: "Duplicate" })),
        );
        expect(refused.isError).toBe(true);
        expect(cancelWorkOrder).toHaveBeenCalledWith(organization, creator, { id: "wo1", reason: "Duplicate" });

        withStatusKey(null);
        for (const name of STATUS_TOOLS) {
            const result = await toolResult(await handleMcpRequest(callTool(name, { id: "wo1" })));
            expect(result, name).toEqual({ content: [{ type: "text", text: MISSING_CREATOR_ERROR }], isError: true });
        }
        expect(sendWorkOrder).not.toHaveBeenCalled();
    });
});
