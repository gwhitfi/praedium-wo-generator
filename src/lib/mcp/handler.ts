// Server-only. Serves /api/mcp: checks the API key, then answers with a fresh, stateless MCP server for that key's
// organization. 2025-era clients get the SDK's stateless fallback, which answers GET and DELETE with 405.
// Requests are rate limited per key, and failed auth per IP (429 with Retry-After).
import { createMcpHandler } from "@modelcontextprotocol/server";
import { hashApiKey, verifyApiKey } from "@/lib/apiKeys";
import { RATE_LIMITS, clientIp, rateLimit, type RateLimitResult } from "@/lib/rateLimit";
import { buildMcpServer } from "./tools";

export function bearerToken(request: Request): string | null {
    const header = request.headers.get("authorization");
    const match = header?.match(/^Bearer\s+(\S+)\s*$/i);
    return match ? match[1] : null;
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
        const failed = await rateLimit(`mcp-auth:${clientIp(request.headers)}`, RATE_LIMITS.mcpAuthFailure);
        if (!failed.ok) return tooManyRequests(failed);
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
