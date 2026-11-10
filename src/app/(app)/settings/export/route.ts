import { getCurrentUser } from "@/lib/auth";
import { buildExport, exportFileName } from "@/lib/exportData";
import { RATE_LIMITS, rateLimit } from "@/lib/rateLimit";
import { zipStream } from "@/lib/zip";

// Settings → Export your data: the organization's data as a ZIP of CSV files and data.json (src/lib/exportData.ts).
// Admins only, since it includes tenant contact details. Streamed, so its size isn't held to Vercel's 4.5 MB limit
// on a buffered response. Layouts don't protect route handlers, so the checks are here.
export async function GET(): Promise<Response> {
    const result = await getCurrentUser();
    if (result.state !== "ready") return new Response("Sign in to export your data.", { status: 401 });
    if (result.role !== "ADMIN") {
        return new Response("Only admins can export the organization's data.", { status: 403 });
    }

    const { organization } = result;
    const allowed = await rateLimit(`export:${organization.id}`, RATE_LIMITS.export);
    if (!allowed.ok) {
        return new Response("Too many exports. Try again in an hour.", {
            status: 429,
            headers: { "Retry-After": String(allowed.retryAfterSeconds) },
        });
    }

    const exportedAt = new Date();
    const entries = await buildExport(organization, exportedAt);
    console.info(`Data export for organization ${organization.id} by user ${result.user.id}`);

    return new Response(zipStream(entries, exportedAt), {
        headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename="${exportFileName(organization.name, exportedAt)}"`,
            "Cache-Control": "no-store",
        },
    });
}
