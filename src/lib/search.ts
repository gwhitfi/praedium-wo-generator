// Text search for the list pages. The lists aren't paginated, so they're filtered in code after the query, the same
// way they're sorted (src/lib/sorting.ts).

export const MAX_QUERY_LENGTH = 100;

// The search box's text from ?q=, trimmed and capped. Empty means no search.
export function readQuery(value: string | string[] | undefined): string {
    const raw = Array.isArray(value) ? value[0] : value;
    return (raw ?? "").trim().slice(0, MAX_QUERY_LENGTH);
}

// Lower case, accents removed, and anything that isn't a letter or digit treated as a space, so "214 maple"
// finds "214 Maple St." and "(864) 555-0100" finds "8645550100" when searched as digits.
function normalize(text: string): string {
    return text
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

// True when every word of the query appears in at least one of the fields. Digits-only words also match phone
// numbers and job numbers written with punctuation. An empty query matches everything.
export function matchesSearch(query: string, fields: (string | null | undefined)[]): boolean {
    const words = normalize(query).split(" ").filter(Boolean);
    if (words.length === 0) return true;

    const haystack = normalize(fields.filter(Boolean).join(" "));
    const digits = haystack.replace(/ /g, "");
    return words.every((word) => haystack.includes(word) || (/^\d+$/.test(word) && digits.includes(word)));
}
