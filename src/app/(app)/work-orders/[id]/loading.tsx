import { pageClass } from "@/lib/ui";

// A placeholder shaped like the work order page while it loads: title, progress, the work and the side column.
export default function Loading() {
    return (
        <div className={pageClass} role="status" aria-label="Loading the work order">
            <div className="animate-pulse">
                <div className="h-4 w-24 rounded bg-surface-hover/70" />
                <div className="mt-6 flex gap-2">
                    <div className="h-5 w-20 rounded bg-surface-hover/70" />
                    <div className="h-5 w-24 rounded-full bg-surface-hover/70" />
                </div>
                <div className="mt-3 h-8 w-80 max-w-full rounded-md bg-surface-hover" />
                <div className="mt-6 h-1.5 w-full rounded-full bg-surface-hover/70" />
                <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-8">
                    <div className="flex flex-col gap-4 lg:col-start-2">
                        <div className="h-44 rounded-xl border border-line bg-surface" />
                        <div className="hidden h-56 rounded-xl border border-line bg-surface lg:block" />
                    </div>
                    <div className="flex flex-col gap-4 lg:col-start-1 lg:row-start-1">
                        <div className="h-6 w-20 rounded bg-surface-hover" />
                        {[0, 1].map((card) => (
                            <div key={card} className="rounded-xl border border-line bg-surface">
                                <div className="h-11 rounded-t-xl border-b border-line bg-surface-hover/40" />
                                {[0, 1, 2].map((row) => (
                                    <div key={row} className="flex items-center gap-3 px-4 py-3.5">
                                        <div className="h-5 w-5 rounded-full bg-surface-hover/70" />
                                        <div className="h-4 flex-1 rounded bg-surface-hover/70" />
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            <span className="sr-only">Loading…</span>
        </div>
    );
}
