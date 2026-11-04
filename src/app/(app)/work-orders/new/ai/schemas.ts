import type { WorkOrderDraft } from "@/lib/workOrderDraft";
import type { ContractorOption, PropertyLookup } from "@/lib/workOrderLookup";
import type { MatchResult } from "@/lib/workOrderMatch";

// The confirmed draft lives in src/lib so the MCP route can share it without this page's types.
export { confirmedDraft, type ConfirmedDraft } from "@/lib/workOrderConfirmed";

// What the bot page gets back after the description is read: the AI's draft and what it matched to.
export type ParseState = {
    error?: string;
    result?: { draft: WorkOrderDraft; property: PropertyLookup; contractor: MatchResult<ContractorOption> };
};
