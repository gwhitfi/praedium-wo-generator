import { PRIORITY_LABELS, PRIORITY_STYLES, STATUS_COLORS, STATUS_DOTS, WORK_ORDER_STATUS_LABELS } from "@/lib/defaults";
import { badgeClass } from "@/lib/ui";
import { AlertIcon, ArrowUpIcon, CheckIcon } from "./Icons";

// A work order's status as a lightly tinted pill with a colored dot; Completed shows a check, so "finished" doesn't
// read as just another green. Never wraps onto two lines. `label` replaces the status name, for a notification tag
// like "Started" that wears the In progress style.
export function StatusBadge({
    status,
    label,
    className = "",
}: {
    status: string;
    label?: string;
    className?: string;
}): React.ReactElement {
    return (
        <span className={`${badgeClass} ${STATUS_COLORS[status] ?? ""} ${className}`}>
            {status === "COMPLETED" ? (
                <CheckIcon size={12} strokeWidth={3} className="text-status-completed" />
            ) : (
                <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${STATUS_DOTS[status] ?? "bg-subtle"}`} />
            )}
            {label ?? WORK_ORDER_STATUS_LABELS[status] ?? status}
        </span>
    );
}

// A line item's priority as a pill, only for Emergency and High. Medium and Low show nothing.
export function PriorityBadge({ priority }: { priority: string }): React.ReactElement | null {
    if (!PRIORITY_STYLES[priority]) return null;
    return (
        <span className={`${badgeClass} ${PRIORITY_STYLES[priority]}`}>
            {priority === "EMERGENCY" ? <AlertIcon size={12} strokeWidth={2.5} /> : <ArrowUpIcon size={12} strokeWidth={2.5} />}
            {PRIORITY_LABELS[priority]}
        </span>
    );
}

// A neutral pill for labels like "Contractor" or "In-house".
export function Tag({ children }: { children: React.ReactNode }): React.ReactElement {
    return <span className={`${badgeClass} border-line-strong text-muted`}>{children}</span>;
}
