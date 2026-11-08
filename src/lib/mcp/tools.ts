// Server-only. The MCP tools, each scoped to the organization whose API key made the request. Anything a tool
// writes is attributed to the key's creator. The status tools are registered only for keys with canChangeStatus.
import { McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { Organization, User } from "@/generated/prisma/client";
import { WorkOrderEventType, WorkOrderStatus } from "@/generated/prisma/enums";
import { getAppUrl } from "@/lib/email";
import { tooLong } from "@/lib/validation";
import { confirmedDraft } from "@/lib/workOrderConfirmed";
import { createDraftWorkOrder } from "@/lib/workOrderCreate";
import type { MatchResult } from "@/lib/workOrderMatch";
import { propertyLookup, type PropertyOption } from "@/lib/workOrderLookup";
import { assistantGuide, serverInstructions } from "./guide";
import {
    addUnit,
    addUnitInput,
    createContact,
    createContactInput,
    createProperty,
    createPropertyInput,
    getContact,
    getProperty,
    getRecordInput,
    searchContacts,
    searchContactsInput,
    updateContact,
    updateContactInput,
    updateProperty,
    updatePropertyInput,
} from "./records";
import {
    archiveWorkOrder,
    cancelInput,
    cancelWorkOrder,
    restoreWorkOrder,
    sendWorkOrder,
    startWorkOrder,
    statusInput,
} from "./status";
import {
    addLineItem,
    addLineItemInput,
    moveArea,
    moveAreaInput,
    moveLineItem,
    moveLineItemInput,
    removeArea,
    removeAreaInput,
    removeLineItem,
    removeLineItemInput,
    renameArea,
    renameAreaInput,
    updateLineItem,
    updateLineItemInput,
    updateWorkOrder,
    updateWorkOrderInput,
} from "./workOrderEdit";
import { getWorkOrder, listActivity, listWorkOrders } from "./workOrders";

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

export async function searchProperties(organizationId: string, query: string): Promise<MatchResult<PropertyOption>> {
    const { property } = await propertyLookup(organizationId, query, null);
    return property;
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
    contractorId: id.optional(),
    unitId: id.optional(),
    query: z.string().trim().min(1).max(200).optional(),
    includeArchived: z.boolean().default(false),
    limit: z.number().int().min(1).max(50).default(20),
});

const getInput = z.object({ id });

const activityInput = z.object({
    workOrderId: id.optional(),
    since: z.iso.datetime({ offset: true }).optional(),
    types: z.array(z.enum(WorkOrderEventType)).max(50).optional(),
    limit: z.number().int().min(1).max(200).default(50),
});

export const MISSING_CREATOR_ERROR =
    "This API key's creator is no longer in Praedium, so the key can't make changes. " +
    "Ask an admin to create a new API key in Settings.";

// A page in the app: a full URL when APP_URL is set (as for links in emails), otherwise the path.
export function appUrl(path: string): string {
    try {
        return getAppUrl() + path;
    } catch {
        return path;
    }
}

export function workOrderUrl(workOrderId: string): string {
    return appUrl(`/work-orders/${workOrderId}`);
}

// `user` is the API key's creator, or null if they were deleted: then the read-only tools still work but every
// tool that writes refuses. `canChangeStatus` adds the send, cancel, archive and restore tools.
export function buildMcpServer({
    organization,
    user,
    canChangeStatus,
}: {
    organization: Pick<Organization, "id" | "name" | "phone" | "email">;
    user: Pick<User, "id" | "firstName" | "lastName" | "email"> | null;
    canChangeStatus: boolean;
}): McpServer {
    const organizationId = organization.id;
    const server = new McpServer(
        { name: "praedium", version: "0.1.0" },
        { instructions: serverInstructions(canChangeStatus) },
    );

    server.registerPrompt(
        "praedium-guide",
        {
            title: "Using Praedium",
            description: "How to find, create and change work orders, properties and contacts with these tools.",
        },
        () => ({
            messages: [{ role: "user", content: { type: "text", text: assistantGuide(canChangeStatus) } }],
        }),
    );

    server.registerTool(
        "search_properties",
        {
            description:
                "Find a property by name, street address or city. Returns status 'matched' with one property, " +
                "'ambiguous' with candidates, or 'notFound'. Each property lists its units; use their ids. " +
                "get_property shows a property's details and each unit's tenants.",
            inputSchema: searchInput,
            annotations: { readOnlyHint: true },
        },
        async ({ query }) => jsonResult(await searchProperties(organizationId, query)),
    );

    server.registerTool(
        "search_contacts",
        {
            description:
                "Find a contact by name or company. type narrows the search: TENANT, CONTRACTOR, OTHER, or " +
                "ASSIGNABLE (contractors and other contacts, the ones a work order can be assigned to; use it when " +
                "choosing a work order's contractor). Leave type out to search every contact. Returns status " +
                "'matched' with one contact, 'ambiguous' with candidates, or 'notFound'; each has id, displayName, " +
                'contactType, company and, for tenants, their unit and property. For "who lives in unit B", use ' +
                "get_property instead.",
            inputSchema: searchContactsInput,
            annotations: { readOnlyHint: true },
        },
        async (input) => jsonResult(await searchContacts(organizationId, input)),
    );

    server.registerTool(
        "get_property",
        {
            description:
                "Get one property by id, archived or not: type, name, address, notes, its units (with each unit's " +
                "tenants and their phone and email), the number of open work orders, and its link.",
            inputSchema: getRecordInput,
            annotations: { readOnlyHint: true },
        },
        async ({ id: propertyId }) => {
            const property = await getProperty(organizationId, propertyId);
            if (!property) return errorResult("No property with that id was found.");
            return jsonResult({ ...property, url: appUrl(`/properties/${property.id}`) });
        },
    );

    server.registerTool(
        "get_contact",
        {
            description:
                "Get one contact by id, archived or not: every detail, a tenant's unit and property, the number of " +
                "open work orders they're the contractor or tenant on, and its link.",
            inputSchema: getRecordInput,
            annotations: { readOnlyHint: true },
        },
        async ({ id: contactId }) => {
            const contact = await getContact(organizationId, contactId);
            if (!contact) return errorResult("No contact with that id was found.");
            return jsonResult({ ...contact, url: appUrl(`/contacts/${contact.id}`) });
        },
    );

    server.registerTool(
        "list_work_orders",
        {
            description:
                "List the organization's work orders, newest first. Archived ones are left out unless " +
                "includeArchived is true; then each row says whether it's archived. Optional filters: status, " +
                "propertyId (from search_properties), contractorId and unitId, and query, which matches the title " +
                "or job number (like 2026-1001). limit defaults to 20, at most 50. Use get_work_order for one " +
                "work order's details.",
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
        "list_activity",
        {
            description:
                "List what happened across the organization's work orders, newest first, worded as in Praedium's " +
                "Activity sections: { type, text, note?, createdAt, workOrder: { id, jobNumber, title } }. " +
                "Optional filters: workOrderId, since (an ISO date-time like 2026-11-04T00:00:00Z), and types (event " +
                "types such as SENT, ITEM_CHECKED, COMPLETED_BY_CONTRACTOR). limit defaults to 50, at most 200.",
            inputSchema: activityInput,
            annotations: { readOnlyHint: true },
        },
        async (filters) => {
            const activity = await listActivity(organizationId, filters);
            if (!activity) return errorResult("No work order with that id was found.");
            return jsonResult(activity);
        },
    );

    server.registerTool(
        "create_draft_work_order",
        {
            description:
                "Create a DRAFT work order. It is not sent: nobody, including the contractor and tenant, is " +
                "notified until it is sent. Get propertyId (and a unitId from that property's units) from " +
                "search_properties and contractorId from search_contacts with type ASSIGNABLE; unitId, " +
                "contractorId, notes and dueDate (YYYY-MM-DD) are optional. Set inHouse: true (and no contractorId) " +
                "when the office's own team does the work: it gets no contractor link and is started with " +
                "start_work_order instead of sent. Each area needs at least one line item. " +
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

    server.registerTool(
        "create_property",
        {
            description:
                "Create a property in Praedium. Call search_properties first so you don't add a duplicate. " +
                "propertyType is one of HOUSE, DUPLEX, TOWNHOUSE, CONDO, APARTMENT, COMMERCIAL, LAND; state is a " +
                "2-letter US state code; zipCode is 5 digits. units is an optional list of { name }; without it " +
                'the property gets one unit named "Main". Returns { id, displayName, units: [{ id, name }], url }.',
            inputSchema: createPropertyInput,
        },
        async (input) => {
            if (!user) return errorResult(MISSING_CREATOR_ERROR);
            const property = await createProperty(organizationId, input);
            return jsonResult({ ...property, url: appUrl(`/properties/${property.id}`) });
        },
    );

    server.registerTool(
        "update_property",
        {
            description:
                "Edit a property that isn't archived. Give its id and only the fields to change: propertyType, " +
                "displayName, addressLine1, addressLine2, city, state (2-letter code), zipCode, notes. An empty " +
                "string clears addressLine2 or notes. Units are added with add_unit. Returns { id, displayName, url }.",
            inputSchema: updatePropertyInput,
        },
        async (input) => {
            if (!user) return errorResult(MISSING_CREATOR_ERROR);
            const result = await updateProperty(organizationId, input);
            if (!result.ok) return errorResult(result.error);
            return jsonResult({ ...result.property, url: appUrl(`/properties/${result.property.id}`) });
        },
    );

    server.registerTool(
        "add_unit",
        {
            description:
                "Add a unit to a property that isn't archived. The name must differ (ignoring case) from the " +
                "property's other units. Returns { id, name }.",
            inputSchema: addUnitInput,
        },
        async (input) => {
            if (!user) return errorResult(MISSING_CREATOR_ERROR);
            const result = await addUnit(organizationId, input);
            if (!result.ok) return errorResult(result.error);
            return jsonResult(result.unit);
        },
    );

    server.registerTool(
        "create_contact",
        {
            description:
                "Create a contact of type TENANT, CONTRACTOR or OTHER. Call search_contacts first so you don't " +
                "add a duplicate. A tenant needs unitId, from the property's units in search_properties; it is " +
                "ignored for the other types. email and phone are optional but validated (phone is a 10-digit US " +
                "number). inHouse: true marks a contractor or other contact as the organization's own employee " +
                "(a label; tenants can't be). Returns { id, displayName, contactType, url }.",
            inputSchema: createContactInput,
        },
        async (input) => {
            if (!user) return errorResult(MISSING_CREATOR_ERROR);
            const result = await createContact(organizationId, input);
            if (!result.ok) return errorResult(result.error);
            return jsonResult({ ...result.contact, url: appUrl(`/contacts/${result.contact.id}`) });
        },
    );

    server.registerTool(
        "update_contact",
        {
            description:
                "Edit a contact that isn't archived. Give its id and only the fields to change (the create_contact " +
                "fields); an empty string clears an optional one. contactType can't change once the contact is on " +
                "a work order. Only tenants have a unit: a tenant's unitId comes from get_property, and changing " +
                "to another type removes the unit. A new displayName, phone or email is also copied onto the open " +
                "work orders the contact is on. Returns { id, displayName, contactType, url }.",
            inputSchema: updateContactInput,
        },
        async (input) => {
            if (!user) return errorResult(MISSING_CREATOR_ERROR);
            const result = await updateContact(organizationId, input);
            if (!result.ok) return errorResult(result.error);
            return jsonResult({ ...result.contact, url: appUrl(`/contacts/${result.contact.id}`) });
        },
    );

    server.registerTool(
        "update_work_order",
        {
            description:
                "Edit an open work order (Draft, Sent or In progress, not archived). Only the fields given change; " +
                "null clears notes, dueDate (YYYY-MM-DD), unitId or contractorId. unitId must be one of the work " +
                "order's property's units; contractorId comes from search_contacts with type ASSIGNABLE. " +
                "inHouse: true hands the work order to the office's own team and removes the contractor; giving a " +
                "contractorId hands it back. Changing " +
                "the contractor on a work order that was already sent makes a new contractor link, and the old " +
                "link stops working. To send, start, cancel, archive or restore, use those tools if this key has " +
                "them; " +
                "otherwise it's done in Praedium. Returns { id, jobNumber, status, changed, newContractorLink, url }.",
            inputSchema: updateWorkOrderInput,
        },
        async (input) => {
            if (!user) return errorResult(MISSING_CREATOR_ERROR);
            const result = await updateWorkOrder(organizationId, user, input);
            if (!result.ok) return errorResult(result.error);
            const { changed, newContractorLink, workOrder } = result;
            return jsonResult({ ...workOrder, changed, newContractorLink, url: workOrderUrl(workOrder.id) });
        },
    );

    server.registerTool(
        "add_line_item",
        {
            description:
                "Add a line item to the named area of an open work order, creating the area if the work order has " +
                "none by that name (ignoring case). Priority is LOW, MEDIUM, HIGH or EMERGENCY. Returns " +
                "{ lineItemId, areaId, areaName, areaCreated }.",
            inputSchema: addLineItemInput,
        },
        async (input) => {
            if (!user) return errorResult(MISSING_CREATOR_ERROR);
            const result = await addLineItem(organizationId, user, input);
            if (!result.ok) return errorResult(result.error);
            const { id: lineItemId, ...area } = result.lineItem;
            return jsonResult({ lineItemId, ...area });
        },
    );

    server.registerTool(
        "update_line_item",
        {
            description:
                "Change a line item's description, priority, or both, on an open work order. Get lineItemId from " +
                "get_work_order. Returns { id, description, priority }.",
            inputSchema: updateLineItemInput,
        },
        async (input) => {
            if (!user) return errorResult(MISSING_CREATOR_ERROR);
            const result = await updateLineItem(organizationId, user, input);
            if (!result.ok) return errorResult(result.error);
            return jsonResult(result.lineItem);
        },
    );

    server.registerTool(
        "move_line_item",
        {
            description:
                "Move a line item on an open work order to a position (1 is first) within its area, or into " +
                "another area of the same work order with areaId. A position past the end puts it last. Use this " +
                "instead of removing and re-adding, which would lose the photo and completion state. Get the ids " +
                "from get_work_order. Returns { id, areaId, position }.",
            inputSchema: moveLineItemInput,
        },
        async (input) => {
            if (!user) return errorResult(MISSING_CREATOR_ERROR);
            const result = await moveLineItem(organizationId, input);
            if (!result.ok) return errorResult(result.error);
            return jsonResult(result.lineItem);
        },
    );

    server.registerTool(
        "remove_line_item",
        {
            description:
                "Delete a line item from an open work order, including its photo if it has one. It can't be " +
                "restored. Get lineItemId from get_work_order. Returns { ok: true }.",
            inputSchema: removeLineItemInput,
            annotations: { destructiveHint: true },
        },
        async (input) => {
            if (!user) return errorResult(MISSING_CREATOR_ERROR);
            const result = await removeLineItem(organizationId, user, input);
            if (!result.ok) return errorResult(result.error);
            return jsonResult({ ok: true });
        },
    );

    server.registerTool(
        "rename_area",
        {
            description: "Rename an area of an open work order. Get areaId from get_work_order. Returns { id, name }.",
            inputSchema: renameAreaInput,
        },
        async (input) => {
            if (!user) return errorResult(MISSING_CREATOR_ERROR);
            const result = await renameArea(organizationId, user, input);
            if (!result.ok) return errorResult(result.error);
            return jsonResult(result.area);
        },
    );

    server.registerTool(
        "move_area",
        {
            description:
                "Move an area of an open work order to a position among its areas (1 is first; a position past " +
                "the end puts it last). Get areaId from get_work_order. Returns { id, position }.",
            inputSchema: moveAreaInput,
        },
        async (input) => {
            if (!user) return errorResult(MISSING_CREATOR_ERROR);
            const result = await moveArea(organizationId, input);
            if (!result.ok) return errorResult(result.error);
            return jsonResult(result.area);
        },
    );

    server.registerTool(
        "remove_area",
        {
            description:
                "Delete an area and all its line items, including their photos, from an open work order. It " +
                "can't be restored. Get areaId from get_work_order. Returns { ok: true }.",
            inputSchema: removeAreaInput,
            annotations: { destructiveHint: true },
        },
        async (input) => {
            if (!user) return errorResult(MISSING_CREATOR_ERROR);
            const result = await removeArea(organizationId, user, input);
            if (!result.ok) return errorResult(result.error);
            return jsonResult({ ok: true });
        },
    );

    if (canChangeStatus) registerStatusTools(server, organization, user);

    return server;
}

// Only for keys with canChangeStatus, so other keys never see these tools.
function registerStatusTools(
    server: McpServer,
    organization: Pick<Organization, "id" | "name" | "phone" | "email">,
    user: Pick<User, "id" | "firstName" | "lastName" | "email"> | null,
): void {
    server.registerTool(
        "send_work_order",
        {
            description:
                "Email the contractor the work order link. Works on Draft, Sent and In progress work orders that " +
                "aren't archived, so it can also re-send, for example after a contractor change. The contractor " +
                "needs an email address; in-house work orders can't be sent (use start_work_order). On the first " +
                "send, the tenant is emailed too when the work order has " +
                'tenant notification on. Confirm with the user first. Returns { id, jobNumber, status: "SENT", ' +
                "sentTo, resent, tenantNotified }.",
            inputSchema: statusInput,
        },
        async (input) => {
            if (!user) return errorResult(MISSING_CREATOR_ERROR);
            const result = await sendWorkOrder(organization, user, input);
            if (!result.ok) return errorResult(result.error);
            return jsonResult(result.workOrder);
        },
    );

    server.registerTool(
        "start_work_order",
        {
            description:
                "Start an in-house Draft work order (inHouse: true), the counterpart of send_work_order for work " +
                "the office's own team does: it becomes In progress and nothing is sent to a contractor. The " +
                "tenant is emailed when the work order has tenant notification on. Confirm with the user first. " +
                'Returns { id, jobNumber, status: "IN_PROGRESS", tenantNotified }.',
            inputSchema: statusInput,
        },
        async (input) => {
            if (!user) return errorResult(MISSING_CREATOR_ERROR);
            const result = await startWorkOrder(organization, user, input);
            if (!result.ok) return errorResult(result.error);
            return jsonResult(result.workOrder);
        },
    );

    server.registerTool(
        "cancel_work_order",
        {
            description:
                "Cancel a Sent or In progress work order and email its contractor that it's cancelled. Drafts " +
                "can't be cancelled; archive them instead. reason is optional and shown in the Activity. Confirm " +
                "with the user first. Returns { id, jobNumber, status }.",
            inputSchema: cancelInput,
            annotations: { destructiveHint: true },
        },
        async (input) => {
            if (!user) return errorResult(MISSING_CREATOR_ERROR);
            const result = await cancelWorkOrder(organization, user, input);
            if (!result.ok) return errorResult(result.error);
            return jsonResult(result.workOrder);
        },
    );

    server.registerTool(
        "archive_work_order",
        {
            description:
                "Archive a work order, hiding it from the usual lists. A Sent or In progress work order is also " +
                "cancelled, and its contractor is emailed that it's cancelled. Confirm with the user first. " +
                "Returns { id, jobNumber, status, archived: true }.",
            inputSchema: statusInput,
        },
        async (input) => {
            if (!user) return errorResult(MISSING_CREATOR_ERROR);
            const result = await archiveWorkOrder(organization, user, input);
            if (!result.ok) return errorResult(result.error);
            return jsonResult(result.workOrder);
        },
    );

    server.registerTool(
        "restore_work_order",
        {
            description:
                "Restore an archived work order. Its status doesn't change: a work order cancelled when it was " +
                "archived stays cancelled. Refused if its property is archived. Returns { id, jobNumber, status, " +
                "archived: false }.",
            inputSchema: statusInput,
        },
        async (input) => {
            if (!user) return errorResult(MISSING_CREATOR_ERROR);
            const result = await restoreWorkOrder(organization, user, input);
            if (!result.ok) return errorResult(result.error);
            return jsonResult(result.workOrder);
        },
    );
}
