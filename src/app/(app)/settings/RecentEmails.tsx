import Link from "next/link";
import type { EmailStatus } from "@/generated/prisma/enums";
import { formatTimestamp } from "@/lib/dates";
import { EMAIL_KIND_LABELS, EMAIL_STATUS_LABELS } from "@/lib/defaults";
import { cardClass, textLinkClass } from "@/lib/ui";

export type RecentEmail = {
    id: string;
    kind: string;
    to: string;
    subject: string;
    status: EmailStatus;
    error: string | null;
    createdAt: Date;
    workOrder: { id: string; jobNumber: string } | null;
};

// Problems in the danger color, the one good outcome in green, the rest plain.
const STATUS_CLASSES: Record<EmailStatus, string> = {
    SENT: "text-muted",
    DELIVERED: "text-success",
    BOUNCED: "text-danger",
    COMPLAINED: "text-danger",
    FAILED: "text-danger",
    SKIPPED: "text-warning",
};

// Settings → Recent emails (admins): the organization's latest emails and what became of each, from EmailLog.
export default function RecentEmails({ emails }: { emails: RecentEmail[] }): React.ReactElement {
    if (emails.length === 0) {
        return <p className={`${cardClass} p-5 text-sm text-muted sm:px-6`}>No emails sent yet.</p>;
    }
    return (
        <ul className={`${cardClass} divide-y divide-line`}>
            {emails.map((email) => (
                <li key={email.id} className="px-5 py-3 text-sm sm:px-6">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                        <p className="min-w-0 truncate font-medium text-foreground">{email.to}</p>
                        <p className={`shrink-0 text-[0.8125rem] font-medium ${STATUS_CLASSES[email.status]}`}>
                            {EMAIL_STATUS_LABELS[email.status]}
                        </p>
                    </div>
                    <p className="mt-0.5 text-[0.8125rem] text-muted">
                        {EMAIL_KIND_LABELS[email.kind] ?? "Email"}
                        {email.workOrder && (
                            <>
                                {" "}
                                for{" "}
                                <Link href={`/work-orders/${email.workOrder.id}`} className={textLinkClass}>
                                    {email.workOrder.jobNumber}
                                </Link>
                            </>
                        )}{" "}
                        · {formatTimestamp(email.createdAt)}
                    </p>
                    {email.error && email.status !== "SENT" && email.status !== "DELIVERED" && (
                        <p className="mt-1 text-[0.8125rem] text-secondary [overflow-wrap:anywhere]">{email.error}</p>
                    )}
                </li>
            ))}
        </ul>
    );
}
