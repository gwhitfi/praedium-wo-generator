// The Praedium Bot description saved in the browser as the user types, so a refresh or a closed tab doesn't lose it.
// Stored as JSON with the time it was saved; older versions stored the plain text.

export const SAVED_DESCRIPTION_KEY = "praedium-bot-description";

// Saved text older than this is dropped instead of restored.
export const SAVED_DESCRIPTION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type SavedDescription = { text: string; savedAt: Date | null };

export function encodeSavedDescription(text: string, now: Date = new Date()): string {
    return JSON.stringify({ text, savedAt: now.toISOString() });
}

// The saved description to restore, or null when there's none, it's blank, or it's too old. Plain text from before
// timestamps were stored has no date and is kept.
export function decodeSavedDescription(raw: string | null, now: Date = new Date()): SavedDescription | null {
    if (!raw) return null;

    let saved: SavedDescription;
    try {
        const value: unknown = JSON.parse(raw);
        if (
            typeof value === "object" &&
            value !== null &&
            "text" in value &&
            typeof value.text === "string" &&
            "savedAt" in value &&
            typeof value.savedAt === "string"
        ) {
            const savedAt = new Date(value.savedAt);
            saved = { text: value.text, savedAt: Number.isNaN(savedAt.getTime()) ? null : savedAt };
        } else {
            saved = { text: raw, savedAt: null };
        }
    } catch {
        saved = { text: raw, savedAt: null };
    }

    if (!saved.text.trim()) return null;
    if (saved.savedAt && now.getTime() - saved.savedAt.getTime() > SAVED_DESCRIPTION_MAX_AGE_MS) return null;
    return saved;
}
