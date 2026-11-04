import { handleMcpRequest } from "@/lib/mcp/handler";

// Remote MCP server for AI assistants. Authenticated by an organization API key, not a Clerk session.
export const POST = handleMcpRequest;
export const GET = handleMcpRequest;
export const DELETE = handleMcpRequest;
