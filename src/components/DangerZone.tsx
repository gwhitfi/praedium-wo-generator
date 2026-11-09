import { sectionTitleClass } from "@/lib/ui";

// The bottom of a detail page, where the actions that stop, hide or delete things live: away from the everyday
// buttons, behind a quiet heading. Each action is a row with what it does and its button.
export default function DangerZone({
    children,
    className = "",
}: {
    children: React.ReactNode;
    className?: string;
}): React.ReactElement {
    return (
        <section aria-labelledby="danger-zone-title" className={`mt-10 border-t border-line pt-6 ${className}`}>
            <h2 id="danger-zone-title" className={sectionTitleClass}>
                Archive or delete
            </h2>
            <div className="mt-3 divide-y divide-line rounded-xl border border-line">{children}</div>
        </section>
    );
}

export function DangerRow({
    title,
    description,
    children,
}: {
    title: string;
    description: React.ReactNode;
    children: React.ReactNode;
}): React.ReactElement {
    return (
        <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{title}</p>
                <p className="mt-0.5 text-sm text-muted">{description}</p>
            </div>
            <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">{children}</div>
        </div>
    );
}
