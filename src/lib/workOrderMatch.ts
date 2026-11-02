// Matches the words a user said ("123 Maple Street", "Joe the plumber", "apt 4B") to the organization's
// properties, units and contacts. Pure functions: the callers load the rows and decide what to do with the result.

export type MatchResult<T> =
    { status: "matched"; match: T } | { status: "ambiguous"; candidates: T[] } | { status: "notFound" };

// A match needs this score (0 to 1) and a lead of MATCH_MARGIN over the next best; anything at
// CANDIDATE_SCORE or above is offered in the picker, best first.
const MATCH_SCORE = 0.8;
const MATCH_MARGIN = 0.15;
const CANDIDATE_SCORE = 0.4;
const MAX_CANDIDATES = 3;

// A close but not exact word ("plumber" and "plumbing", "Mapel" and "Maple") counts for less than an exact one.
const FUZZY_TOKEN_SCORE = 0.8;
// A house number the user said that the candidate doesn't have halves its score, so it's never matched on its own.
const NUMBER_MISMATCH_FACTOR = 0.5;

const STOP_WORDS = new Set([
    ...["the", "a", "an", "at", "on", "of", "in", "and", "for", "to", "by", "with"],
    // Filler in spoken descriptions: "the Maple Court building", "the Summerville one".
    ...["building", "property", "one"],
]);

const ABBREVIATIONS: Record<string, string> = {
    street: "st",
    avenue: "ave",
    road: "rd",
    drive: "dr",
    lane: "ln",
    boulevard: "blvd",
    court: "ct",
    place: "pl",
    circle: "cir",
    parkway: "pkwy",
    highway: "hwy",
    terrace: "ter",
    trail: "trl",
    square: "sq",
    north: "n",
    south: "s",
    east: "e",
    west: "w",
};

function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/['’]s\b/g, "")
        .replace(/['’]/g, "")
        .split(/[^a-z0-9]+/)
        .filter((token) => token && !STOP_WORDS.has(token))
        .map((token) => ABBREVIATIONS[token] ?? token);
}

const isNumber = (token: string) => /^\d+$/.test(token);

// Edit distance where swapping two neighboring letters counts as one edit (optimal string alignment).
function editDistance(a: string, b: string): number {
    const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => i || j));
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
                d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
            }
        }
    }
    return d[a.length][b.length];
}

function commonPrefixLength(a: string, b: string): number {
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    return i;
}

function tokenScore(query: string, candidate: string): number {
    if (query === candidate) return 1;
    // Numbers only match exactly: 123 and 124 are different houses.
    if (/\d/.test(query) || /\d/.test(candidate)) return 0;

    const [shorter, longer] = query.length <= candidate.length ? [query, candidate] : [candidate, query];
    const isPrefix = shorter.length >= 3 && longer.startsWith(shorter);
    const sharesStem = commonPrefixLength(query, candidate) >= 5;
    const isTypo = shorter.length >= 5 && editDistance(query, candidate) <= 1;
    return isPrefix || sharesStem || isTypo ? FUZZY_TOKEN_SCORE : 0;
}

// How well the query's words are covered by the candidate's words, from 0 to 1.
function score(queryTokens: string[], candidateTokens: string[]): number {
    const total = queryTokens.reduce(
        (sum, query) => sum + Math.max(0, ...candidateTokens.map((candidate) => tokenScore(query, candidate))),
        0,
    );
    const missingNumber = queryTokens.some((query) => isNumber(query) && !candidateTokens.includes(query));
    return (total / queryTokens.length) * (missingNumber ? NUMBER_MISMATCH_FACTOR : 1);
}

export function matchByText<T>(
    query: string | null,
    items: T[],
    textOf: (item: T) => (string | null)[],
): MatchResult<T> {
    const queryTokens = query ? tokenize(query) : [];
    if (queryTokens.length === 0) return { status: "notFound" };

    const ranked = items
        .map((item) => ({ item, score: score(queryTokens, tokenize(textOf(item).filter(Boolean).join(" "))) }))
        .filter((entry) => entry.score >= CANDIDATE_SCORE)
        .sort((a, b) => b.score - a.score);

    const [best, next] = ranked;
    if (!best) return { status: "notFound" };
    if (best.score >= MATCH_SCORE && best.score - (next?.score ?? 0) >= MATCH_MARGIN) {
        return { status: "matched", match: best.item };
    }
    return { status: "ambiguous", candidates: ranked.slice(0, MAX_CANDIDATES).map((entry) => entry.item) };
}

// "123 Maple St apt 4" becomes "123 Maple St ", so the unit number isn't mistaken for a house number.
const UNIT_DESIGNATOR = /(\b(unit|apt|apartment|suite|ste)\b\.?|#)\s*[a-z0-9-]+/gi;

export function matchProperty<T extends { displayName: string; addressLine1: string; city: string }>(
    query: string,
    properties: T[],
): MatchResult<T> {
    return matchByText(query.replace(UNIT_DESIGNATOR, " "), properties, (p) => [p.displayName, p.addressLine1, p.city]);
}

export function matchContact<
    T extends { displayName: string; firstName: string | null; lastName: string | null; company: string | null },
>(query: string | null, contacts: T[]): MatchResult<T> {
    return matchByText(query, contacts, (c) => [c.displayName, c.firstName, c.lastName, c.company]);
}

// "Unit 4B", "apt #4b" and "4 B" all become "4b".
function unitKey(name: string): string {
    return name
        .toLowerCase()
        .replace(/\b(unit|apt|apartment|suite|ste|number|no)\b/g, "")
        .replace(/[^a-z0-9]/g, "");
}

// Units match exactly (after unitKey), never fuzzily: 4B and 4C are different apartments.
// A property with a single unit always uses it, as the work order form does.
export function matchUnit<T extends { name: string }>(unitText: string | null, units: T[]): MatchResult<T> {
    if (units.length === 1) return { status: "matched", match: units[0] };
    if (!unitText) return { status: "notFound" };

    const key = unitKey(unitText);
    const found = key ? units.filter((unit) => unitKey(unit.name) === key) : [];
    if (found.length === 1) return { status: "matched", match: found[0] };
    if (found.length > 1) return { status: "ambiguous", candidates: found.slice(0, MAX_CANDIDATES) };
    return { status: "notFound" };
}
