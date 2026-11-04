// Server-only. The MCP tools, each scoped to the organization whose API key made the request. Anything a tool
// writes is attributed to the key's creator.
import { McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { User } from "@/generated/prisma/client";
import { WorkOrderStatus } from "@/generated/prisma/enums";
import { getAppUrl } from "@/lib/email";
import { tooLong } from "@/lib/validation";
import { confirmedDraft } from "@/lib/workOrderConfirmed";
import { createDraftWorkOrder } from "@/lib/workOrderCreate";
import type { MatchResult } from "@/lib/workOrderMatch";
import { contractorLookup, propertyLookup, type PropertyOption } from "@/lib/workOrderLookup";
import { getWorkOrder, listWorkOrders } from "./workOrders";

const searchInput = z.object({
    query: z.string().trim().min(1).max(200),
});

// confirmedDraft with the optional fields truly optional: an assistant may leave them out instead of sending null.
const optionalId = z.string().min(1).max(100).nullable().default(null);
const createInput = confirmedDraft.extend({
    unitId: optionalId,
    contractorId: optionalId,
    notes: z
        .string()
        .trim()
        .max(5000, tooLong(5000))
        .nullable()
        .default(null)
        .transform((val) => val || null),
    dueDate: z.iso.date().nullable().default(null),
});

export type ContractorResult = { id: string; displayName: string; company: string | null };

export async function searchProperties(organizationId: string, query: string): Promise<MatchResult<PropertyOption>> {
    const { property } = await propertyLookup(organizationId, query, null);
    return property;
}

export async function searchContractors(organizationId: string, query: string): Promise<MatchResult<ContractorResult>> {
    const result = await contractorLookup(organizationId, query);
    const compact = ({ id, displayName, company }: ContractorResult): ContractorResult => ({
        id,
        displayName,
        company,
    });
    if (result.status === "matched") return { status: "matched", match: compact(result.match) };
    if (result.status === "ambiguous") return { status: "ambiguous", candidates: result.candidates.map(compact) };
    return result;
}

function jsonResult(value: unknown): CallToolResult {
    return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

function errorResult(message: string): CallToolResult {
    return { content: [{ type: "text", text: message }], isError: true };
}

const id = z.string().min(1).max(100);

const listInput = z.object({
    status: z.enum(WorkOrderStatus).optional(),
    propertyId: id.optional(),
    query: z.string().trim().min(1).max(200).optional(),
    limit: z.number().int().min(1).max(50).default(20),
});

const getInput = z.object({ id });

export const MISSING_CREATOR_ERROR =
    "This API key's creator is no longer in Praedium, so the key can't create work orders. " +
    "Ask an admin to create a new API key in Settings.";

// The work order's page in the app: a full URL when APP_URL is set (as for links in emails), otherwise the path.
export function workOrderUrl(workOrderId: string): string {
    const path = `/work-orders/${workOrderId}`;
    try {
        return getAppUrl() + path;
    } catch {
        return path;
    }
}

// `user` is the API key's creator, or null if they were deleted: then the read-only tools still work but
// create_draft_work_order refuses.
export function buildMcpServer({
    organizationId,
    user,
}: {
    organizationId: string;
    user: Pick<User, "id" | "firstName" | "lastName" | "email"> | null;
}): McpServer {
    const server = new McpServer({ name: "praedium", version: "0.1.0" });

    server.registerTool(
        "search_properties",
        {
            description:
                "Find a property by name, street address or city. Returns status 'matched' with one property, " +
                "'ambiguous' with candidates, or 'notFound'. Each property lists its units; use their ids.",
            inputSchema: searchInput,
            annotations: { readOnlyHint: true },
        },
        async ({ query }) => jsonResult(await searchProperties(organizationId, query)),
    );

    server.registerTool(
        "search_contractors",
        {
            description:
                "Find a contractor by name or company. Returns status 'matched' with one contractor, " +
                "'ambiguous' with candidates, or 'notFound'.",
            inputSchema: searchInput,
            annotations: { readOnlyHint: true },
        },
        async ({ query }) => jsonResult(await searchContractors(organizationId, query)),
    );

    server.registerTool(
        "list_work_orders",
        {
            description:
                "List the organization's work orders (archived ones left out), newest first. Optional filters: " +
                "status, propertyId (from search_properties), and query, which matches the title or job number " +
                "(like 2026-1001). limit defaults to 20, at most 50. Use get_work_order for one work order's details.",
            inputSchema: listInput,
            annotations: { readOnlyHint: true },
        },
        async (filters) => jsonResult(await listWorkOrders(organizationId, filters)),
    );

    server.registerTool(
        "get_work_order",
        {
            description:
                "Get one work order by id: status and dates, property, unit, contractor and tenant details, " +
                "areas with line items, and its activity history (newest first).",
            inputSchema: getInput,
            annotations: { readOnlyHint: true },
        },
        async ({ id: workOrderId }) => {
            const workOrder = await getWorkOrder(organizationId, workOrderId);
            if (!workOrder) return errorResult("No work order with that id was found.");
            return jsonResult({ ...workOrder, url: workOrderUrl(workOrder.id) });
        },
    );

    server.registerTool(
        "create_draft_work_order",
        {
            description:
                "Create a DRAFT work order. It is not sent: nobody, including the contractor and tenant, is " +
                "notified until a person reviews and sends it in Praedium. Get propertyId (and a unitId from that " +
                "property's units) from search_properties and contractorId from search_contractors; unitId, " +
                "contractorId, notes and dueDate (YYYY-MM-DD) are optional. Each area needs at least one line item. " +
                "Returns the new work order's id, job number, status and link.",
            inputSchema: createInput,
        },
        async (draft) => {
            if (!user) return errorResult(MISSING_CREATOR_ERROR);

            const result = await createDraftWorkOrder({
                organizationId,
                actor: { kind: "office", user },
                draft,
                source: "mcp",
            });
            if (!result.ok) return errorResult(result.error);

            const { id: workOrderId, jobNumber } = result.workOrder;
            return jsonResult({ id: workOrderId, jobNumber, status: "DRAFT", url: workOrderUrl(workOrderId) });
        },
    );

    return server;
}
