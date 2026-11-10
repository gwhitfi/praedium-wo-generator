import prisma from "@/lib/prisma";

// For an uptime monitor: 200 when the app can reach its database, 503 when it can't. Public and says nothing else.
export async function GET(): Promise<Response> {
    const headers = { "Cache-Control": "no-store" };
    try {
        await prisma.$queryRaw`SELECT 1`;
        return Response.json({ ok: true }, { headers });
    } catch (error) {
        console.error("Health check: database unreachable", error);
        return Response.json({ ok: false }, { status: 503, headers });
    }
}
