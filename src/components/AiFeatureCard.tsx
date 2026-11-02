import AiDemoVideo from "./AiDemoVideo";

// The shared look for explaining the AI work order tool: the dashboard prompt and the Settings preference.
// `actions` sits at the right of the footer strip (under the demo link on phones).
export default function AiFeatureCard({
    title,
    titleAs: Title = "h2",
    note,
    demoLabel,
    actions,
}: {
    title: string;
    titleAs?: "h2" | "h3";
    note: string;
    demoLabel: string;
    actions: React.ReactNode;
}): React.ReactElement {
    return (
        <section className="overflow-hidden rounded-xl border border-accent/30 bg-surface shadow-sm">
            <div className="flex gap-4 p-5 sm:p-6">
                <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent sm:flex">
                    <SparklesIcon size={20} />
                </div>
                <div className="min-w-0 flex-1">
                    <Title className="flex items-start gap-2 text-base font-semibold text-foreground sm:text-lg">
                        <span className="mt-0.5 text-accent sm:hidden">
                            <SparklesIcon size={18} />
                        </span>
                        {title}
                    </Title>
                    <p className="mt-2 text-sm leading-relaxed text-muted">
                        Turn a plain text description, like{" "}
                        <strong className="rounded bg-accent/10 py-0.5 pr-0.5 pl-1.5 font-medium text-foreground [box-decoration-break:clone]">
                            &ldquo;Unit 4B, kitchen sink is leaking, Joe&apos;s Plumbing by Friday&rdquo;
                        </strong>
                        , into a draft work order for you to review.
                    </p>
                    <p className="mt-3 flex items-start gap-2 text-sm text-subtle">
                        <span className="mt-0.5 shrink-0">
                            <ShieldIcon />
                        </span>
                        {note}
                    </p>
                </div>
            </div>
            <div className="flex flex-col gap-3 border-t border-accent/20 bg-accent/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <AiDemoVideo label={demoLabel} />
                {actions}
            </div>
        </section>
    );
}

const iconProps = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
} as const;

export function SparklesIcon({ size }: { size: number }) {
    return (
        <svg width={size} height={size} {...iconProps}>
            <path d="M10 3l1.9 5.1L17 10l-5.1 1.9L10 17l-1.9-5.1L3 10l5.1-1.9L10 3Z" />
            <path d="M19 15v6M16 18h6" />
        </svg>
    );
}

function ShieldIcon() {
    return (
        <svg width={16} height={16} {...iconProps}>
            <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3Z" />
            <path d="M9 12l2 2 4-4" />
        </svg>
    );
}
