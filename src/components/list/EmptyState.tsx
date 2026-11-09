import Link from "next/link";
import { buttonClass } from "@/lib/ui";
import { PlusIcon } from "@/components/Icons";

// A friendly placeholder for a list with nothing in it: an icon, what's missing, why it matters and what to do next.
// `compact` is the slim version used inside a page section.
export default function EmptyState({
    title,
    message,
    actionHref,
    actionLabel,
    icon,
    compact = false,
    secondary,
}: {
    title?: string;
    message: string;
    actionHref?: string;
    actionLabel?: string;
    icon?: React.ReactNode;
    compact?: boolean;
    secondary?: React.ReactNode;
}): React.ReactElement {
    if (compact) {
        return (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-line-strong/60 px-4 py-4 text-sm">
                <p className="text-muted">{message}</p>
                {actionHref && actionLabel && (
                    <Link href={actionHref} className={buttonClass({ size: "sm" })}>
                        {actionLabel}
                    </Link>
                )}
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center rounded-xl border border-dashed border-line-strong/60 px-6 py-14 text-center">
            {icon && (
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-hover text-muted">
                    {icon}
                </div>
            )}
            {title && <h2 className="text-base font-semibold text-foreground">{title}</h2>}
            <p className={`max-w-sm text-sm text-muted ${title ? "mt-1" : ""}`}>{message}</p>
            {(actionHref || secondary) && (
                <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                    {actionHref && actionLabel && (
                        <Link href={actionHref} className={buttonClass({ variant: "primary" })}>
                            <PlusIcon />
                            {actionLabel}
                        </Link>
                    )}
                    {secondary}
                </div>
            )}
        </div>
    );
}
