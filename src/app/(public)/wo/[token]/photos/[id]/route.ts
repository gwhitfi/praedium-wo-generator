import prisma from "@/lib/prisma";
import { isVerifiedFor } from "@/lib/contractorAccess";
import { photoNotFound, servePhoto } from "@/lib/servePhoto";
import { photoInput } from "../../schemas";

// Contractor view of a photo. No account: the publicToken is the credential, so the photo must belong to
// that token's work order, and the work order must be one the contractor page shows photos for.
export async function GET(
    request: Request,
    { params }: { params: Promise<{ token: string; id: string }> },
): Promise<Response> {
    const { token, id } = await params;
    const input = photoInput.safeParse({ token, attachmentId: id });
    if (!input.success) return photoNotFound();

    const attachment = await prisma.attachment.findFirst({
        where: {
            id: input.data.attachmentId,
            lineItem: {
                area: {
                    workOrder: {
                        publicToken: input.data.token,
                        archived: false,
                        inHouse: false,
                        status: { notIn: ["DRAFT", "CANCELLED"] },
                    },
                },
            },
        },
        select: {
            storageKey: true,
            lineItem: {
                select: { area: { select: { workOrder: { select: { contractorEmail: true, status: true } } } } },
            },
        },
    });
    if (!attachment) return photoNotFound();

    // Photos need a verified contractor session (unless there's no contractor email to verify), and closed work
    // orders show the summary only.
    const workOrder = attachment.lineItem?.area.workOrder;
    if (!workOrder || workOrder.status === "CLOSED") return photoNotFound();
    if (workOrder.contractorEmail && !(await isVerifiedFor(workOrder))) return photoNotFound();

    return servePhoto(attachment.storageKey, request);
}
