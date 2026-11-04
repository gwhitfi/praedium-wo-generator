// Server-only. A work order's activity history (the WorkOrderEvent model). Actions call logEvent() after their
// main write. It never throws, so a problem saving history can't break sending, checking off an item, and so on.
import type { DeliveryMethod, LineItemPriority, Prisma, User, WorkOrderEventType } from "@/generated/prisma/client";
import prisma from "./prisma";
import { appTimeZone } from "./dates";

// Longest note text kept in a NOTE_SAVED event.
export const NOTE_MAX_LENGTH = 500;

// The line item an event is about, copied as it read at the time.
type ItemRef = { item: string; area: string };

// The `detail` saved with each event type; null means none.
type DetailsByType = {
    CREATED: { source: "form" | "bot" | "mcp" };
    EDITED: { fields: string[] };
    // `tenantNotified` is set only when the tenant email was queued on the first send.
    SENT: { deliveryMethod: DeliveryMethod; resent: boolean; tenantNotified?: true };
    CONTRACTOR_CHANGED: { from: string | null; to: string | null };
    COMPLETED_BY_OFFICE: null;
    CANCELLED: { reason: string | null };
    REOPENED: null;
    CLOSED: null;
    ARCHIVED: null;
    RESTORED: null;
    PHOTO_ADDED: ItemRef;
    PHOTO_REMOVED: ItemRef;
    ITEM_ADDED: ItemRef;
    ITEM_REMOVED: ItemRef;
    // `item` is the new description. `from` is the old one, if it changed; `priority`, if that changed.
    ITEM_EDITED: ItemRef & { from?: string; priority?: { from: LineItemPriority; to: LineItemPriority } };
    AREA_ADDED: { area: string };
    AREA_REMOVED: { area: string };
    AREA_RENAMED: { from: string; to: string };
    OPENED: null;
    ITEM_CHECKED: ItemRef;
    ITEM_UNCHECKED: ItemRef;
    NOTE_SAVED: ItemRef & { note: string };
    COMPLETED_BY_CONTRACTOR: { notes: string | null };
};

// Fails to compile if an event type in the schema is missing from DetailsByType.
type CoversEveryType<T extends Record<WorkOrderEventType, unknown>> = T;
export type EventDetails = CoversEveryType<DetailsByType>;

// Who did it: a signed-in office user, or the contractor on the public page (named as on the work order).
export type Actor =
    | { kind: "office"; user: Pick<User, "id" | "firstName" | "lastName" | "email"> }
    | { kind: "contractor"; name: string | null };

// One event to save. workOrderId and organizationId must come from data the action has already checked,
// never straight from the client.
export type EventInput = {
    [K in WorkOrderEventType]: {
        type: K;
        workOrderId: string;
        organizationId: string;
        actor: Actor;
    } & (EventDetails[K] extends null ? { detail?: undefined } : { detail: EventDetails[K] });
}[WorkOrderEventType];

// "Justin W.": first name and last initial. Falls back to whichever name there is, then the email.
export function officeActorName(user: Pick<User, "firstName" | "lastName" | "email">): string {
    const first = user.firstName?.trim();
    const last = user.lastName?.trim();
    if (first && last) return `${first} ${last[0].toUpperCase()}.`;
    return first || last || user.email;
}

// Link scanners, chat previews and crawlers that open contractor links on their own. A missing user agent counts
// too: browsers always send one. A rough filter; RecordOpen's visible-for-2-seconds wait does most of the work.
const BOT_USER_AGENT =
    /bot|crawl|spider|slurp|preview|headless|scanner|facebookexternalhit|whatsapp|telegram|discord|skype|embedly|proofpoint|mimecast|barracuda/i;

export function isLikelyBot(userAgent: string | null): boolean {
    return !userAgent?.trim() || BOT_USER_AGENT.test(userAgent);
}

// The day an event happened in APP_TIMEZONE, as "2026-10-23". Used for the one-open-per-day key.
export function eventDayKey(date: Date): string {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: appTimeZone(),
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(date);
}

// The row to insert for an event.
export function eventData(input: EventInput, dedupeKey?: string): Prisma.WorkOrderEventUncheckedCreateInput {
    const { actor } = input;
    const detail =
        input.type === "NOTE_SAVED"
            ? { ...input.detail, note: input.detail.note.slice(0, NOTE_MAX_LENGTH) }
            : input.detail;

    return {
        type: input.type,
        workOrderId: input.workOrderId,
        organizationId: input.organizationId,
        byContractor: actor.kind === "contractor",
        actorUserId: actor.kind === "office" ? actor.user.id : null,
        actorName: actor.kind === "office" ? officeActorName(actor.user) : actor.name?.trim() || null,
        ...(detail ? { detail } : {}),
        ...(dedupeKey ? { dedupeKey } : {}),
    };
}

// Saves one event. Never throws: failures are logged and the action carries on.
export async function logEvent(input: EventInput): Promise<void> {
    try {
        await prisma.workOrderEvent.create({ data: eventData(input) });
    } catch (error) {
        console.error(`Could not log ${input.type} for work order ${input.workOrderId}`, error);
    }
}

// Saves several events in one insert, for actions that change many work orders at once. Never throws.
export async function logEvents(inputs: EventInput[]): Promise<void> {
    if (inputs.length === 0) return;
    try {
        await prisma.workOrderEvent.createMany({ data: inputs.map((input) => eventData(input)) });
    } catch (error) {
        console.error(`Could not log ${inputs.length} work order events`, error);
    }
}

// Saves a contractor open, at most once per work order per day (in APP_TIMEZONE). Two loads at the same moment
// still give one row: the second hits the unique dedupeKey and is skipped. Never throws.
export async function logDailyOpen(
    input: { workOrderId: string; organizationId: string; contractorName: string | null },
    now: Date = new Date(),
): Promise<void> {
    const event: EventInput = {
        type: "OPENED",
        workOrderId: input.workOrderId,
        organizationId: input.organizationId,
        actor: { kind: "contractor", name: input.contractorName },
    };
    try {
        await prisma.workOrderEvent.createMany({
            data: [eventData(event, `opened:${eventDayKey(now)}`)],
            skipDuplicates: true,
        });
    } catch (error) {
        console.error(`Could not log OPENED for work order ${input.workOrderId}`, error);
    }
}
