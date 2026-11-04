// Server-only. Serves /api/mcp: checks the API key, then answers with a fresh, stateless MCP server for that key's
// organization. 2025-era clients get the SDK's stateless fallback, which answers GET and DELETE with 405.
import { createMcpHandler } from "@modelcontextprotocol/server";
import { verifyApiKey } from "@/lib/apiKeys";
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

export async function handleMcpRequest(request: Request): Promise<Response> {
    const token = bearerToken(request);
    const verified = token ? await verifyApiKey(token) : null;
    if (!verified) return unauthorized();

    const organizationId = verified.organization.id;
    const { user } = verified;
    const handler = createMcpHandler(() => buildMcpServer({ organizationId, user }), {
        legacy: "stateless",
        onerror: (error) => console.error("MCP request failed", error),
    });
    return handler.fetch(request);
}
