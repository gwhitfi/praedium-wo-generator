import Link from "next/link";
import { cardClass } from "@/lib/ui";

export type Detail = {
    label: string;
    // The main line. Links to `href` when given.
    value: React.ReactNode;
    href?: string;
    // Smaller lines under the value: phone, email, city.
    extra?: React.ReactNode;
    // Shown in a quieter color, for "Not assigned" and the like.
    empty?: boolean;
};

// A card of labelled facts (Property, Contractor, Tenant…), one per row. Replaces a row of separate cards, so the
// details stay compact on phones and leave room for the work itself. `title` adds a heading row.
export default function DetailList({
    details,
    title,
    className = "",
}: {
    details: Detail[];
    title?: string;
    className?: string;
}): React.ReactElement {
    return (
        <section className={`${cardClass} @container ${className}`} aria-label={title}>
            {title && <h2 className="border-b border-line px-4 py-3 text-sm font-semibold sm:px-5">{title}</h2>}
            {/* Label beside the value when the card is wide enough, above it in a narrow sidebar. */}
            <dl className="divide-y divide-line">
                {details.map((detail) => (
                    <div
                        key={detail.label}
                        className="grid gap-1 px-4 py-3 sm:px-5 @sm:grid-cols-[6.5rem_minmax(0,1fr)] @sm:gap-3"
                    >
                        <dt className="pt-px text-xs font-medium uppercase tracking-wide text-subtle">{detail.label}</dt>
                        <dd className="min-w-0 text-sm">
                            <div
                                className={`font-medium [overflow-wrap:anywhere] ${detail.empty ? "font-normal text-subtle" : "text-foreground"}`}
                            >
                                {detail.href ? (
                                    // A light underline marks the record link before it's hovered (touch has no hover).
                                    <Link
                                        href={detail.href}
                                        className="underline decoration-line-strong underline-offset-4 hover:text-accent hover:decoration-current"
                                    >
                                        {detail.value}
                                    </Link>
                                ) : (
                                    detail.value
                                )}
                            </div>
                            {detail.extra && (
                                <div className="mt-0.5 space-y-0.5 text-muted [overflow-wrap:anywhere]">{detail.extra}</div>
                            )}
                        </dd>
                    </div>
                ))}
            </dl>
        </section>
    );
}

// A phone number or email under a detail, as a tap-to-call or tap-to-email link. A long email breaks after the "@"
// rather than in the middle of a word.
export function ContactLine({ href, children }: { href: string; children: React.ReactNode }): React.ReactElement {
    const text =
        typeof children === "string" && children.includes("@") ? (
            <>
                {children.slice(0, children.indexOf("@") + 1)}
                <wbr />
                {children.slice(children.indexOf("@") + 1)}
            </>
        ) : (
            children
        );
    return (
        <a
            href={href}
            className="block w-fit max-w-full underline decoration-line-strong underline-offset-2 [overflow-wrap:break-word] hover:text-foreground hover:decoration-current"
        >
            {text}
        </a>
    );
}
