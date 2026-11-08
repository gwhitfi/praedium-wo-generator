// Guidance for the AI assistant using the MCP server: short instructions sent with every connection, and the fuller
// walkthrough offered as the "praedium-guide" prompt. Both depend on whether the key can change status.

export function serverInstructions(canChangeStatus: boolean): string {
    const status = canChangeStatus
        ? "This key can also send, start, cancel, archive and restore work orders with send_work_order, " +
          "start_work_order (in-house work orders), cancel_work_order, archive_work_order and restore_work_order. " +
          "They email the contractor (and on a first send or start, sometimes the tenant), so confirm with the " +
          "user before calling them."
        : "This key can't send, cancel, archive or restore work orders; a person does that in Praedium.";
    return [
        "Praedium manages maintenance work orders for property managers.",
        "Search before creating: use search_properties and search_contacts so you don't add duplicates, and ask " +
            "the user when a search is ambiguous instead of guessing.",
        "Get area and line item ids from get_work_order.",
        "Ask the user before removing a line item or area; removes are permanent.",
        "New work orders are drafts. Never say a work order was sent unless send_work_order succeeded.",
        status,
        "The praedium-guide prompt has a fuller walkthrough.",
    ].join(" ");
}

export function assistantGuide(canChangeStatus: boolean): string {
    const sending = canChangeStatus
        ? [
              "## Sending and other status changes",
              "",
              "- send_work_order emails the contractor the work order link. It works on Draft, Sent and In progress " +
                  "work orders, so it also re-sends after a contractor change. On the first send, the tenant is " +
                  "emailed too when the work order has tenant notification on. Confirm with the user first.",
              "- start_work_order is the in-house counterpart: it moves an in-house Draft to In progress without " +
                  "sending anything, and emails the tenant when tenant notification is on. Confirm first.",
              "- cancel_work_order works only on Sent or In progress work orders and emails the contractor. " +
                  "Archive a draft instead.",
              "- archive_work_order hides a work order. A Sent or In progress one is also cancelled and its " +
                  "contractor emailed.",
              "- restore_work_order brings an archived work order back. A cancelled one stays cancelled.",
          ]
        : [
              "## Sending",
              "",
              "This key can't send, cancel, archive or restore work orders. Tell the user to send the draft from " +
                  "Praedium, and never tell anyone it has been sent.",
          ];

    return [
        "# Using Praedium",
        "",
        "Praedium manages maintenance work orders for property managers. A work order belongs to a property " +
            "(and optionally one of its units), may have a contractor, and holds areas (a room, the roof, the " +
            "yard) with line items, one per problem. Statuses: Draft, Sent, In progress, Completed, Closed, or " +
            "Cancelled. Only Draft, Sent and In progress work orders that aren't archived can be edited.",
        "",
        "## Creating a work order",
        "",
        "1. Call search_properties with the address or name the user gave. If it returns 'ambiguous', ask which " +
            "one. Pick the unit from the property's units if one was named; get_property also lists each unit's " +
            "tenants.",
        "2. Only if the user named a contractor, call search_contacts with type ASSIGNABLE. If it's ambiguous, ask. " +
            "If the office's own team will do the work, set inHouse: true instead of a contractor.",
        "3. Call create_draft_work_order with those ids, a short title, the description as notes, and one area " +
            "per room with one line item per problem (priority LOW, MEDIUM, HIGH or EMERGENCY).",
        "4. Reply with the job number and the link.",
        "",
        "If the property or contractor doesn't exist yet, ask before creating it with create_property or " +
            "create_contact, and search first so you don't add a duplicate.",
        "",
        "## Changing a work order",
        "",
        "- Find it with list_work_orders (by job number, title, property, contractor or unit), then read it with " +
            "get_work_order for its area and line item ids.",
        "- update_work_order changes the title, notes, due date, unit, contractor (or inHouse) or tenant " +
            "notification. " +
            "Changing the contractor on a sent work order makes a new contractor link; the old one stops working.",
        "- add_line_item, update_line_item, rename_area, move_area and move_line_item edit the work. Use " +
            "move_line_item to move an item to another area instead of removing and re-adding it, which would " +
            "lose its photo and completion state.",
        "- Ask the user before remove_line_item or remove_area: both are permanent and delete photos.",
        "",
        "## People and places",
        "",
        "- search_contacts finds tenants, contractors and other contacts; get_contact shows one in full. For " +
            '"who lives in unit B", use get_property.',
        "- update_contact and update_property change details. A contact's new name, phone or email is copied " +
            "onto its open work orders. add_unit adds a unit to a property.",
        "",
        "## History",
        "",
        "list_activity shows what happened across the organization's work orders, newest first (filter by work " +
            "order, type, or since a date-time). get_work_order includes one work order's history.",
        "",
        ...sending,
    ].join("\n");
}
