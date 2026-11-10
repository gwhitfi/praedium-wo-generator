// What a Server Action returns when the reason it refused should reach the user. A message thrown on the server
// arrives in the browser without its text in production, so refusals the user can act on come back as values.
export type ActionResult = { ok: true } | { ok: false; error: string };

// The error message in an action's result, or null when it succeeded. Anything that isn't an `{ ok: false }` result
// (including undefined, from the demo's local stand-ins) counts as success.
export function resultError(result: unknown): string | null {
    if (typeof result !== "object" || result === null || !("ok" in result) || result.ok !== false) return null;
    return "error" in result && typeof result.error === "string" ? result.error : "Something went wrong. Try again.";
}
