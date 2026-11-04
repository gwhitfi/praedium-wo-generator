// Turns WorkOrderEvent rows into the lines shown in a work order's Activity section. No database access.
// Stored details are checked with Zod before use: rows backfilled from older records, or written by older code,
// can be missing fields, and a bad row falls back to a plain label instead of breaking the page.
import { z } from "zod";
import type { Prisma, WorkOrderEventType } from "@/generated/prisma/client";
import { appTimeZone } from "./dates";
import { PRIORITY_LABELS } from "./defaults";

export type ActivityEvent = {
    id: string;
    type: WorkOrderEventType;
    createdAt: Date;
    actorName: string | null;
    byContractor: boolean;
    detail: Prisma.JsonValue;
};

// `note` is quoted text shown under the line (a contractor's note, completion notes, a cancel reason).
export type ActivityLine = { text: string; note?: string; backfilled: boolean };

// Used when a row's detail can't be read, and for backfilled rows with no actor.
const PLAIN_LABELS: Record<WorkOrderEventType, string> = {
    CREATED: "Work order created",
    EDITED: "Work order edited",
    SENT: "Sent to the contractor",
    CONTRACTOR_CHANGED: "Contractor changed",
    COMPLETED_BY_OFFICE: "Marked complete",
    CANCELLED: "Cancelled",
    REOPENED: "Reopened",
    CLOSED: "Closed",
    ARCHIVED: "Archived",
    RESTORED: "Restored",
    PHOTO_ADDED: "Photo added",
    PHOTO_REMOVED: "Photo removed",
    ITEM_ADDED: "Line item added",
    ITEM_REMOVED: "Line item removed",
    ITEM_EDITED: "Line item edited",
    AREA_ADDED: "Area added",
    AREA_REMOVED: "Area removed",
    AREA_RENAMED: "Area renamed",
    OPENED: "Opened by the contractor",
    ITEM_CHECKED: "Line item checked off",
    ITEM_UNCHECKED: "Line item unchecked",
    NOTE_SAVED: "Note saved",
    COMPLETED_BY_CONTRACTOR: "Marked complete",
};

const FIELD_LABELS: Record<string, string> = {
    title: "title",
    notes: "notes",
    dueDate: "due date",
    unit: "unit",
    notifyTenant: "tenant notification",
};

const itemRef = z.object({ item: z.string(), area: z.string() });
const priority = z.enum(["EMERGENCY", "HIGH", "MEDIUM", "LOW"]);
const schemas = {
    CREATED: z.object({ source: z.enum(["form", "bot", "mcp"]).optional() }),
    EDITED: z.object({ fields: z.array(z.string()).min(1) }),
    SENT: z.object({
        deliveryMethod: z.enum(["EMAIL", "SMS", "PRINT"]).optional(),
        resent: z.boolean().optional(),
        tenantNotified: z.boolean().optional(),
    }),
    CONTRACTOR_CHANGED: z.object({ from: z.string().nullable(), to: z.string().nullable() }),
    CANCELLED: z.object({ reason: z.string().nullish() }),
    ITEM_EDITED: itemRef.extend({
        from: z.string().optional(),
        priority: z.object({ from: priority, to: priority }).optional(),
    }),
    AREA: z.object({ area: z.string() }),
    AREA_RENAMED: z.object({ from: z.string(), to: z.string() }),
    NOTE_SAVED: itemRef.extend({ note: z.string() }),
    COMPLETED_BY_CONTRACTOR: z.object({ notes: z.string().nullish() }),
};

// The wording for one event: `active` follows the actor's name ("Marcus Hill checked off ..."); `passive` stands
// alone for backfilled rows with no actor. Null when the detail can't be read.
type Phrase = { active: string; passive?: string; note?: string };

const quoted = (text: string) => `"${text}"`;
const onItem = (ref: { item: string; area: string }) => `${quoted(ref.item)} (${ref.area})`;

// "title", "title and due date", "title, notes and due date"
function listFields(fields: string[]): string {
    const labels = fields.map((field) => FIELD_LABELS[field] ?? field);
    return labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

function phrase(type: WorkOrderEventType, detail: Prisma.JsonValue): Phrase | null {
    const read = <T extends z.ZodType>(schema: T): z.infer<T> | null => {
        const parsed = schema.safeParse(detail ?? {});
        return parsed.success ? parsed.data : null;
    };
    const item = () => read(itemRef);

    switch (type) {
        case "CREATED": {
            const d = read(schemas.CREATED);
            if (d?.source === "bot") return { active: "created the work order with Praedium Bot" };
            if (d?.source === "mcp") return { active: "created the work order through the API" };
            return { active: "created the work order" };
        }
        case "EDITED": {
            const d = read(schemas.EDITED);
            if (!d) return null;
            if (d.fields.includes("link")) return { active: "made a new contractor link" };
            return { active: `edited the ${listFields(d.fields)}` };
        }
        case "SENT": {
            const d = read(schemas.SENT);
            const tenant = d?.tenantNotified ? " and emailed the tenant" : "";
            if (d?.deliveryMethod === "EMAIL") {
                return {
                    active: `${d.resent ? "re-sent it by email" : "sent it by email"}${tenant}`,
                    passive: "Sent by email",
                };
            }
            if (d?.deliveryMethod === "PRINT") {
                return { active: `marked it sent (printed)${tenant}`, passive: "Marked sent (printed)" };
            }
            if (d?.deliveryMethod === "SMS") {
                return { active: `marked it sent (by text)${tenant}`, passive: "Marked sent (by text)" };
            }
            return { active: `sent it to the contractor${tenant}` };
        }
        case "CONTRACTOR_CHANGED": {
            const d = read(schemas.CONTRACTOR_CHANGED);
            if (!d) return null;
            if (!d.from && d.to) return { active: `assigned ${d.to}` };
            if (d.from && !d.to) return { active: `removed ${d.from} as the contractor` };
            return { active: `changed the contractor from ${d.from} to ${d.to}` };
        }
        case "COMPLETED_BY_OFFICE":
            return { active: "marked it complete" };
        case "CANCELLED": {
            const reason = read(schemas.CANCELLED)?.reason;
            return { active: "cancelled it", ...(reason ? { note: reason } : {}) };
        }
        case "REOPENED":
            return { active: "reopened it" };
        case "CLOSED":
            return { active: "closed it" };
        case "ARCHIVED":
            return { active: "archived it" };
        case "RESTORED":
            return { active: "restored it" };
        case "PHOTO_ADDED": {
            const d = item();
            return d && { active: `added a photo to ${onItem(d)}` };
        }
        case "PHOTO_REMOVED": {
            const d = item();
            return d && { active: `removed the photo from ${onItem(d)}` };
        }
        case "ITEM_ADDED": {
            const d = item();
            return d && { active: `added ${onItem(d)}` };
        }
        case "ITEM_REMOVED": {
            const d = item();
            return d && { active: `removed ${onItem(d)}` };
        }
        case "ITEM_EDITED": {
            const d = read(schemas.ITEM_EDITED);
            if (!d) return null;
            const change = d.priority
                ? `priority from ${PRIORITY_LABELS[d.priority.from]} to ${PRIORITY_LABELS[d.priority.to]}`
                : null;
            if (d.from !== undefined) {
                const renamed = `renamed ${quoted(d.from)} to ${onItem(d)}`;
                return { active: change ? `${renamed} and changed its ${change}` : renamed };
            }
            return { active: change ? `changed the ${change} on ${onItem(d)}` : `edited ${onItem(d)}` };
        }
        case "AREA_ADDED": {
            const d = read(schemas.AREA);
            return d && { active: `added the area ${quoted(d.area)}` };
        }
        case "AREA_REMOVED": {
            const d = read(schemas.AREA);
            return d && { active: `removed the area ${quoted(d.area)}` };
        }
        case "AREA_RENAMED": {
            const d = read(schemas.AREA_RENAMED);
            return d && { active: `renamed the area ${quoted(d.from)} to ${quoted(d.to)}` };
        }
        case "OPENED":
            return { active: "opened the work order" };
        case "ITEM_CHECKED": {
            const d = item();
            return d && { active: `checked off ${onItem(d)}`, passive: `Checked off ${onItem(d)}` };
        }
        case "ITEM_UNCHECKED": {
            const d = item();
            return d && { active: `unchecked ${onItem(d)}` };
        }
        case "NOTE_SAVED": {
            const d = read(schemas.NOTE_SAVED);
            if (!d) return null;
            return d.note
                ? { active: `added a note to ${onItem(d)}`, note: d.note }
                : { active: `cleared the note on ${onItem(d)}` };
        }
        case "COMPLETED_BY_CONTRACTOR": {
            const notes = read(schemas.COMPLETED_BY_CONTRACTOR)?.notes;
            return { active: "marked the work complete", ...(notes ? { note: notes } : {}) };
        }
    }
}

export function describeEvent(event: Omit<ActivityEvent, "id" | "createdAt">): ActivityLine {
    const detail = event.detail;
    const backfilled =
        typeof detail === "object" && detail !== null && !Array.isArray(detail) && detail.backfilled === true;
    const words = phrase(event.type, detail);
    const note = words?.note ? { note: words.note } : {};

    if (!words) return { text: PLAIN_LABELS[event.type], backfilled };
    if (event.actorName) return { text: `${event.actorName} ${words.active}`, ...note, backfilled };
    if (backfilled) return { text: words.passive ?? PLAIN_LABELS[event.type], ...note, backfilled };
    return { text: `${event.byContractor ? "The contractor" : "The office"} ${words.active}`, ...note, backfilled };
}

// "Oct 23, 2026 · 9:12 AM" in APP_TIMEZONE.
export function formatEventTime(date: Date): string {
    const timeZone = appTimeZone();
    const day = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone });
    const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone });
    // Newer ICU versions put a narrow no-break space before AM/PM; use a plain one.
    return `${day} · ${time.replace(/ /g, " ")}`;
}
