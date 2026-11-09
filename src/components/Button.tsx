import Link from "next/link";
import { buttonClass, type ButtonSize, type ButtonVariant } from "@/lib/ui";

type StyleProps = {
    variant?: ButtonVariant;
    size?: ButtonSize;
    full?: boolean;
};

// A <button> in one of the shared styles. While `pending`, it's disabled and shows a spinner and `pendingLabel`.
export function Button({
    variant,
    size,
    full,
    pending = false,
    pendingLabel,
    className = "",
    type = "button",
    disabled,
    children,
    ...rest
}: StyleProps &
    React.ButtonHTMLAttributes<HTMLButtonElement> & { pending?: boolean; pendingLabel?: string }): React.ReactElement {
    return (
        <button
            type={type}
            disabled={disabled || pending}
            aria-busy={pending || undefined}
            className={buttonClass({ variant, size, full, className })}
            {...rest}
        >
            {pending && <Spinner />}
            {pending && pendingLabel ? pendingLabel : children}
        </button>
    );
}

// A link that looks like a button.
export function ButtonLink({
    variant,
    size,
    full,
    className = "",
    href,
    children,
    ...rest
}: StyleProps & React.ComponentProps<typeof Link>): React.ReactElement {
    return (
        <Link href={href} className={buttonClass({ variant, size, full, className })} {...rest}>
            {children}
        </Link>
    );
}

export function Spinner({ className = "" }: { className?: string }): React.ReactElement {
    return (
        <svg
            className={`h-4 w-4 animate-spin ${className}`}
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
            focusable="false"
        >
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
            <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
    );
}
