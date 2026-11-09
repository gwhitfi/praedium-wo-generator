import { pageClass } from "@/lib/ui";

// A page-shaped placeholder while a signed-in page loads: the title, the toolbar and a few rows.
export default function Loading() {
    return (
        <div className={pageClass} role="status" aria-label="Loading">
            <div className="animate-pulse">
                <div className="h-8 w-48 rounded-md bg-surface-hover" />
                <div className="mt-3 h-4 w-32 rounded bg-surface-hover/70" />
                <div className="mt-8 flex gap-2">
                    <div className="h-10 w-full max-w-xs rounded-md bg-surface-hover/70" />
                    <div className="h-10 w-28 rounded-md bg-surface-hover/70" />
                </div>
                <div className="mt-5 overflow-hidden rounded-xl border border-line">
                    {[0, 1, 2, 3, 4, 5].map((row) => (
                        <div key={row} className="flex items-center gap-4 border-b border-line px-4 py-4 last:border-b-0">
                            <div className="h-4 w-16 rounded bg-surface-hover/70" />
                            <div className="h-4 flex-1 rounded bg-surface-hover" />
                            <div className="hidden h-5 w-20 rounded-full bg-surface-hover/70 sm:block" />
                            <div className="hidden h-4 w-32 rounded bg-surface-hover/70 md:block" />
                        </div>
                    ))}
                </div>
            </div>
            <span className="sr-only">Loading…</span>
        </div>
    );
}
