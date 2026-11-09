import Link from "next/link";
import { CheckIcon } from "./Icons";

export type Step = string | { label: string; href?: string };

// "1 Details → 2 The work → 3 Send": where a multi-step task is up to. `current` is the 1-based step. A finished step
// with an `href` links back to it.
export default function Steps({
    steps,
    current,
    className = "mb-6",
}: {
    steps: Step[];
    current: number;
    className?: string;
}): React.ReactElement {
    return (
        <ol aria-label="Steps" className={`flex flex-wrap items-center gap-x-3 gap-y-2 text-sm ${className}`}>
            {steps.map((step, i) => {
                const { label, href } = typeof step === "string" ? { label: step, href: undefined } : step;
                const number = i + 1;
                const done = number < current;
                const active = number === current;
                const content = (
                    <>
                        <span
                            className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                                active
                                    ? "bg-accent text-on-accent"
                                    : done
                                      ? "bg-success/15 text-success"
                                      : "border border-line-strong text-subtle"
                            }`}
                        >
                            {done ? <CheckIcon size={12} strokeWidth={3} /> : number}
                        </span>
                        <span className={active ? "font-medium text-foreground" : done ? "text-muted" : "text-subtle"}>
                            {label}
                        </span>
                        {done && <span className="sr-only">(done)</span>}
                    </>
                );
                return (
                    <li key={label} className="flex items-center gap-3" aria-current={active ? "step" : undefined}>
                        {done && href ? (
                            <Link href={href} className="flex items-center gap-2 rounded hover:underline">
                                {content}
                            </Link>
                        ) : (
                            <span className="flex items-center gap-2">{content}</span>
                        )}
                        {number < steps.length && <span aria-hidden className="h-px w-6 bg-line-strong sm:w-10" />}
                    </li>
                );
            })}
        </ol>
    );
}
