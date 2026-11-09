import { taskPageClass } from "@/lib/ui";

// A placeholder shaped like a create or edit form while the page loads: back link, title and a card of fields.
export default function FormSkeleton({ label }: { label: string }): React.ReactElement {
    return (
        <div className={taskPageClass} role="status" aria-label={label}>
            <div className="animate-pulse">
                <div className="h-4 w-24 rounded bg-surface-hover/70" />
                <div className="mt-6 h-8 w-56 rounded-md bg-surface-hover" />
                <div className="mt-3 h-4 w-80 max-w-full rounded bg-surface-hover/70" />
                <div className="mt-8 flex flex-col gap-6 rounded-xl border border-line bg-surface p-5 sm:p-6">
                    {[0, 1, 2, 3].map((field) => (
                        <div key={field}>
                            <div className="h-4 w-28 rounded bg-surface-hover/70" />
                            <div className="mt-2 h-10 rounded-md bg-surface-hover/60" />
                        </div>
                    ))}
                </div>
            </div>
            <span className="sr-only">Loading…</span>
        </div>
    );
}
