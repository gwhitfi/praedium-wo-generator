import Link from "next/link";
import Logo from "./Logo";
import { ArrowLeftIcon } from "./Icons";

// The page around Clerk's sign-in and sign-up widgets: the Praedium logo (back to the home page) above it, and the
// terms line below.
export default function AuthFrame({
    agreement,
    children,
}: {
    agreement: string;
    children: React.ReactNode;
}): React.ReactElement {
    return (
        <main id="main" className="flex min-h-screen flex-col items-center px-4 py-10 text-foreground">
            <div className="flex w-full max-w-md items-center justify-between">
                <Link href="/" aria-label="Praedium home" className="rounded text-foreground">
                    <Logo className="h-7 w-auto" />
                </Link>
                <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
                    <ArrowLeftIcon size={14} />
                    Home
                </Link>
            </div>
            <div className="flex w-full flex-1 flex-col items-center justify-center gap-5 py-10">
                {children}
                <p className="max-w-sm text-center text-xs text-subtle">
                    {agreement}{" "}
                    <Link href="/terms" className="underline hover:text-foreground">
                        Terms of Service
                    </Link>{" "}
                    and{" "}
                    <Link href="/privacy" className="underline hover:text-foreground">
                        Privacy Policy
                    </Link>
                    .
                </p>
            </div>
        </main>
    );
}
