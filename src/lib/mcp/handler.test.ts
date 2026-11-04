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
vi.mock("./workOrders", () => ({ listWorkOrders: vi.fn(), getWorkOrder: vi.fn() }));

import prisma from "@/lib/prisma";
import { generateApiKey } from "@/lib/apiKeys";
import { createDraftWorkOrder } from "@/lib/workOrderCreate";
import { bearerToken, handleMcpRequest } from "./handler";
import { MISSING_CREATOR_ERROR } from "./tools";
import { getWorkOrder, listWorkOrders } from "./workOrders";

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
    } as never);
    vi.mocked(prisma.apiKey.update).mockResolvedValue({} as never);
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

describe("handleMcpRequest auth gate", () => {
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

    it("answers initialize with a valid key", async () => {
        const response = await handleMcpRequest(mcpRequest(initialize));
        expect(response.status).toBe(200);
        const { result } = await rpcResult(response);
        expect(result?.serverInfo).toMatchObject({ name: "praedium" });
    });
});

describe("search_properties over MCP", () => {
    it("lists every tool, marking only the create tool as not read-only", async () => {
        const response = await handleMcpRequest(mcpRequest({ jsonrpc: "2.0", id: 2, method: "tools/list" }));
        const { result } = await rpcResult(response);
        const tools = result?.tools as { name: string; annotations?: { readOnlyHint?: boolean } }[];
        expect(tools.map((tool) => tool.name).sort()).toEqual([
            "create_draft_work_order",
            "get_work_order",
            "list_work_orders",
            "search_contractors",
            "search_properties",
        ]);
        for (const tool of tools) {
            expect(tool.annotations?.readOnlyHint, tool.name).toBe(
                tool.name === "create_draft_work_order" ? undefined : true,
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
            draft: { ...draft, title: "Fix leak", notes: null },
            source: "mcp",
        });
        vi.unstubAllEnvs();
    });

    it("treats left-out unitId, contractorId, notes and dueDate as null", async () => {
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
                draft: { ...minimal, unitId: null, contractorId: null, notes: null, dueDate: null },
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
        expect(listWorkOrders).toHaveBeenCalledWith("org1", { status: "DRAFT", query: "leak", limit: 20 });
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
