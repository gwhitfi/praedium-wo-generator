import Link from "next/link";
import ThemeToggle from "./ThemeToggle";
import Logo from "./Logo";
import { buttonClass } from "@/lib/ui";

// The header for signed-out visitors: the logo on the left, the demo, theme, sign in and sign up on the right.
// The same on every screen size, so nothing moves between phone and desktop.
export default function PublicHeader(): React.ReactElement {
    return (
        <header className="sticky top-0 z-40 border-b border-line bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <div className="mx-auto flex h-16 max-w-5xl items-center gap-2 px-4">
                <Link href="/" aria-label="Praedium home" className="mr-auto shrink-0 rounded text-foreground">
                    <Logo className="h-6 w-auto" />
                </Link>
                <Link href="/demo" className={buttonClass({ variant: "ghost", size: "sm", className: "max-sm:hidden" })}>
                    Try the demo
                </Link>
                <ThemeToggle />
                <Link href="/sign-in" className={buttonClass({ variant: "ghost", size: "sm" })}>
                    Sign in
                </Link>
                <Link href="/sign-up" className={buttonClass({ variant: "primary", size: "sm" })}>
                    Get started
                </Link>
            </div>
        </header>
    );
}
