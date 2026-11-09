import Link from "next/link";
import { ArrowLeftIcon, PlusIcon } from "@/components/Icons";
import { buttonClass } from "@/lib/ui";

export type BackTarget = { href: string; label: string };

// The top of every signed-in page: an optional back link, the title with an optional subtitle, and the page's main
// action on the right. `actions` replaces the single action when a page needs more than one button.
export default function PageHeader({
    title,
    subtitle,
    back,
    actionHref,
    actionLabel,
    mobileLabel = "New",
    actions,
    eyebrow,
}: {
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    back?: BackTarget;
    actionHref?: string;
    actionLabel?: string;
    mobileLabel?: string;
    actions?: React.ReactNode;
    eyebrow?: React.ReactNode;
}): React.ReactElement {
    return (
        <div className="mb-6 sm:mb-8">
            {back && <BackLink {...back} />}
            {/* The eyebrow (status, type) sits above the row, so the buttons line up with the title itself. */}
            {eyebrow && <div className="mb-2 flex flex-wrap items-center gap-2">{eyebrow}</div>}
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
                <div className="min-w-0 flex-1">
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground [overflow-wrap:anywhere] sm:text-[1.75rem] sm:leading-9">
                        {title}
                    </h1>
                    {/* Polite live region: on list pages the count changes as you search or filter. */}
                    {subtitle && (
                        <div aria-live="polite" className="mt-1 text-sm text-muted">
                            {subtitle}
                        </div>
                    )}
                </div>
                {actions ? (
                    // On phones a record page's buttons get their own row, so they don't squeeze a long title.
                    <div className="flex shrink-0 flex-wrap items-center gap-2 max-sm:basis-full">{actions}</div>
                ) : (
                    actionHref &&
                    actionLabel && (
                        <Link href={actionHref} aria-label={actionLabel} className={buttonClass({ variant: "primary" })}>
                            <PlusIcon />
                            <span className="sm:hidden">{mobileLabel}</span>
                            <span className="hidden sm:inline">{actionLabel}</span>
                        </Link>
                    )
                )}
            </div>
        </div>
    );
}

// "← Work orders" above a page title, back to the list or parent page.
export function BackLink({ href, label }: BackTarget): React.ReactElement {
    return (
        <Link
            href={href}
            className="-ml-1 mb-2 inline-flex min-h-10 items-center gap-1.5 rounded px-1 text-sm text-muted hover:text-foreground"
        >
            <ArrowLeftIcon size={14} />
            {label}
        </Link>
    );
}
