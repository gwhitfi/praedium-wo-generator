import Link from "next/link";

export type FilterTab = { label: string; href: string; active: boolean; count?: number };

// A list's filters as a row of tabs, for wide screens. Phones use the compact FilterMenu instead.
export default function FilterTabs({ tabs, label }: { tabs: FilterTab[]; label: string }): React.ReactElement {
    return (
        <nav aria-label={label} className="mb-4 hidden border-b border-line md:block">
            <ul className="-mb-px flex gap-1 overflow-x-auto">
                {tabs.map((tab) => (
                    <li key={tab.label} className="shrink-0">
                        <Link
                            href={tab.href}
                            scroll={false}
                            aria-current={tab.active ? "page" : undefined}
                            className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm transition-colors ${
                                tab.active
                                    ? "border-accent font-medium text-foreground"
                                    : "border-transparent text-muted hover:border-line-strong hover:text-foreground"
                            }`}
                        >
                            {tab.label}
                            {tab.count !== undefined && (
                                <span className="rounded-full bg-surface-hover px-1.5 text-xs tabular-nums text-subtle">
                                    {tab.count}
                                </span>
                            )}
                        </Link>
                    </li>
                ))}
            </ul>
        </nav>
    );
}
