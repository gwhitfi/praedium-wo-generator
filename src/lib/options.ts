import { matchesSearch } from "./search";

// One choice in a searchable dropdown (src/components/form/Combobox.tsx).
export type ComboOption = {
    value: string;
    label: string;
    // A second, quieter line, such as the company or the address.
    description?: string;
    // Starred (favorite) records get a ★.
    starred?: boolean;
    // Options with the same group are listed under one heading, in the order given.
    group?: string;
    // Extra text the search also looks at.
    keywords?: (string | null | undefined)[];
};

// The options that match the search text, in their original order. Uses the list pages' matching, so every word
// must appear somewhere and digits match across punctuation.
export function filterOptions(options: ComboOption[], query: string): ComboOption[] {
    if (!query.trim()) return options;
    return options.filter((option) =>
        matchesSearch(query, [option.label, option.description, ...(option.keywords ?? [])]),
    );
}

// Puts starred options first, keeping the order within each part. For lists that aren't grouped otherwise.
export function starredFirst<T extends { starred?: boolean }>(options: T[]): T[] {
    return [...options.filter((o) => o.starred), ...options.filter((o) => !o.starred)];
}
