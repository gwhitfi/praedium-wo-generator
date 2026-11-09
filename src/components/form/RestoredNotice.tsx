"use client";

import { Button } from "@/components/Button";
import { RotateIcon } from "@/components/Icons";
import { savedWhen } from "@/lib/formDraft";

// "Restored what you started earlier today. [Start fresh]" above a form that put back an unsaved draft.
export default function RestoredNotice({
    what,
    savedAt,
    onStartFresh,
}: {
    // "the work order", "the description"
    what: string;
    savedAt: Date | null;
    onStartFresh: () => void;
}): React.ReactElement {
    return (
        <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line-strong/60 bg-background/40 px-3 py-2 text-sm"
        >
            <span className="text-secondary">
                Restored {what} you started {savedWhen(savedAt)}.
            </span>
            <Button size="sm" variant="ghost" onClick={onStartFresh}>
                <RotateIcon size={14} />
                Start fresh
            </Button>
        </div>
    );
}
