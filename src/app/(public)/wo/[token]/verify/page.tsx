import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";
import { isVerifiedFor } from "@/lib/contractorAccess";
import { getContractorWorkOrder, maskEmail } from "@/lib/contractorWorkOrders";
import { magicLinkInput, openInput } from "../schemas";
import ConfirmForm from "./ConfirmForm";

export const metadata: Metadata = {
    title: "Verify",
    robots: { index: false, follow: false },
    referrer: "no-referrer",
};

// The link in the verification email. It only shows a Confirm button: email link scanners open URLs on their own,
// and a plain GET must never use up the code.
export default async function VerifyContractor({
    params,
    searchParams,
}: {
    params: Promise<{ token: string }>;
    searchParams: Promise<{ c?: string | string[] }>;
}): Promise<React.ReactElement> {
    const { token } = await params;
    if (!openInput.safeParse({ token }).success) notFound();
    const workOrder = await getContractorWorkOrder(token);
    if (!workOrder) notFound();
    if (await isVerifiedFor(workOrder)) redirect(`/wo/${token}`);

    const query = await searchParams;
    const link = magicLinkInput.safeParse(Array.isArray(query.c) ? query.c[0] : query.c);

    return (
        <main className="mx-auto max-w-3xl px-4 py-10 text-foreground">
            {/* Standard light/dark only: the theme script never applies Settings palettes on /wo/ pages. */}
            <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-xs uppercase tracking-wide text-subtle">
                    {workOrder.organization.name} · #{workOrder.jobNumber}
                </p>
                <div className="print:hidden">
                    <ThemeToggle />
                </div>
            </div>

            <h1 className="mb-4 text-2xl font-semibold">Verify this browser</h1>

            {/* A closed job only shows the summary, so verifying from it is refused like a bad link. */}
            {link.success && workOrder.contractorEmail && workOrder.status !== "CLOSED" ? (
                <>
                    <p className="mb-6 text-sm text-muted">
                        Confirm that you&apos;re{" "}
                        <span className="text-foreground">{maskEmail(workOrder.contractorEmail)}</span> to see the full
                        work order on this device.
                    </p>
                    <ConfirmForm token={token} challengeId={link.data.challengeId} code={link.data.code} />
                </>
            ) : (
                <p className="text-sm text-muted">
                    This link isn&apos;t valid.{" "}
                    <Link href={`/wo/${token}`} className="underline hover:text-foreground">
                        Go back to the work order
                    </Link>{" "}
                    and send a new code.
                </p>
            )}

            <p className="mt-10 text-center text-xs text-subtle print:hidden">
                <Link href="/privacy" className="underline hover:text-foreground">
                    Privacy Policy
                </Link>
            </p>
        </main>
    );
}
