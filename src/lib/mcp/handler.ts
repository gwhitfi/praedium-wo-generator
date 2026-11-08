// Server-only. Serves /api/mcp: checks the API key, then answers with a fresh, stateless MCP server for that key's
// organization. 2025-era clients get the SDK's stateless fallback, which answers GET and DELETE with 405.
// Requests are rate limited per key, and failed auth per IP (429 with Retry-After). A refused request is logged with
// the reason (no header, not "Bearer <key>", wrong shape, unknown or revoked) and at most the key's 8-character prefix.
import { createMcpHandler } from "@modelcontextprotocol/server";
import { hashApiKey, looksLikeApiKey, verifyApiKey } from "@/lib/apiKeys";
import { RATE_LIMITS, clientIp, rateLimit, type RateLimitResult } from "@/lib/rateLimit";
import { buildMcpServer } from "./tools";

export function bearerToken(request: Request): string | null {
    const header = request.headers.get("authorization");
    const match = header?.match(/^Bearer\s+(\S+)\s*$/i);
    return match ? match[1] : null;
}

// Why a request was turned away, for the runtime logs. `token` is the bearer value, or null when there was none.
export function authFailureReason(request: Request, token: string | null): string {
    const header = request.headers.get("authorization");
    if (header === null) return "no Authorization header";
    if (header.trim() === "") return "empty Authorization header";
    if (token === null) {
        const words = header.trim().split(/\s+/);
        if (!/^bearer$/i.test(words[0])) return `header does not start with "Bearer" (starts "${header.slice(0, 8)}")`;
        return `"Bearer" followed by ${words.length - 1} words, expected one key (starts "${header.slice(0, 14)}")`;
    }
    if (!looksLikeApiKey(token)) {
        const shape = token.startsWith("pr_") ? `pr_ + ${token.length - 3} chars, expected 43` : `does not start with pr_ (${token.length} chars)`;
        return `token has the wrong shape: ${shape} (starts "${token.slice(0, 11)}")`;
    }
    return `unknown or revoked key (prefix ${token.slice(3, 11)})`;
}

function requestContext(request: Request): Record<string, string> {
    return {
        method: request.method,
        host: request.headers.get("host") ?? "",
        ip: clientIp(request.headers),
        userAgent: request.headers.get("user-agent") ?? "",
    };
}

function unauthorized(): Response {
    return Response.json(
        { error: "Missing or invalid API key. Send it as Authorization: Bearer <key>." },
        { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="praedium"' } },
    );
}

function tooManyRequests(result: RateLimitResult): Response {
    return Response.json(
        { error: "Too many requests. Try again later." },
        { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } },
    );
}

export async function handleMcpRequest(request: Request): Promise<Response> {
    const token = bearerToken(request);
    const verified = token ? await verifyApiKey(token) : null;
    if (!token || !verified) {
        const reason = authFailureReason(request, token);
        const failed = await rateLimit(`mcp-auth:${clientIp(request.headers)}`, RATE_LIMITS.mcpAuthFailure);
        if (!failed.ok) {
            console.warn("MCP auth rate limited", { reason, retryAfterSeconds: failed.retryAfterSeconds, ...requestContext(request) });
            return tooManyRequests(failed);
        }
        console.warn("MCP auth refused", { reason, ...requestContext(request) });
        return unauthorized();
    }

    const limited = await rateLimit(`mcp:${hashApiKey(token)}`, RATE_LIMITS.mcp);
    if (!limited.ok) return tooManyRequests(limited);

    const { organization, user, canChangeStatus } = verified;
    const handler = createMcpHandler(() => buildMcpServer({ organization, user, canChangeStatus }), {
        legacy: "stateless",
        onerror: (error) => console.error("MCP request failed", error),
    });
    return handler.fetch(request);
}
