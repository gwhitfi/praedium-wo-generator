// A create form's unsaved values, kept in the browser as the user types, so a refresh, a closed tab or a trip to add
// a property doesn't lose them. Stored as JSON with the time it was saved. Shared with client components; the
// storage itself is read and written by the forms.

import { formatShortDate } from "./dates";

// Drafts older than this are dropped instead of restored.
export const FORM_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type FormDraft = {
    values: Record<string, string>;
    savedAt: Date;
    // Saved on the way to add a property or contractor: restored quietly on the way back, without a notice.
    quiet: boolean;
};

export function encodeFormDraft(values: Record<string, string>, quiet = false, now: Date = new Date()): string {
    return JSON.stringify({ values, savedAt: now.toISOString(), quiet });
}

// The draft to restore, or null when there's none, it can't be read, it's too old, or none of `meaningful` (the
// fields worth restoring, such as the title) has anything in it.
export function decodeFormDraft(raw: string | null, meaningful: string[], now: Date = new Date()): FormDraft | null {
    if (!raw) return null;
    let value: unknown;
    try {
        value = JSON.parse(raw);
    } catch {
        return null;
    }
    if (typeof value !== "object" || value === null || !("values" in value) || !("savedAt" in value)) return null;
    const { values, savedAt } = value as { values: unknown; savedAt: unknown };
    if (typeof values !== "object" || values === null || typeof savedAt !== "string") return null;

    const strings: Record<string, string> = {};
    for (const [key, entry] of Object.entries(values)) {
        if (typeof entry === "string") strings[key] = entry;
    }
    const date = new Date(savedAt);
    if (Number.isNaN(date.getTime()) || now.getTime() - date.getTime() > FORM_DRAFT_MAX_AGE_MS) return null;
    if (!meaningful.some((key) => strings[key]?.trim())) return null;
    return { values: strings, savedAt: date, quiet: "quiet" in value && value.quiet === true };
}

// One unsent piece of text (a contractor's note), kept in this browser under `key` so a reload doesn't lose it.
// Browser-only: call these from event handlers and effects. Storage can be blocked; then they do nothing.
export function readTextDraft(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

export function saveTextDraft(key: string, text: string): void {
    try {
        if (text.trim()) localStorage.setItem(key, text);
        else localStorage.removeItem(key);
    } catch {
        // Not saved; the text is still on screen.
    }
}

export function clearTextDraft(key: string): void {
    try {
        localStorage.removeItem(key);
    } catch {
        // Nothing to clear.
    }
}

// "earlier today", "on Nov 7", or "earlier" when the date isn't known, for "Restored what you started …".
export function savedWhen(savedAt: Date | null, now: Date = new Date()): string {
    if (!savedAt) return "earlier";
    return savedAt.toDateString() === now.toDateString() ? "earlier today" : `on ${formatShortDate(savedAt)}`;
}
