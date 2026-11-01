import Link from "next/link";
import ThemeToggle from "./ThemeToggle";
import Logo from "./Logo";
import InfoMenu from "./InfoMenu";
import MobileMenu from "./MobileMenu";
import { INFO_LINKS } from "@/lib/defaults";

// The landing page has the logo in its hero, so it leaves it out of the header; other public pages show it.
export default function PublicHeader({ showLogo = false }: { showLogo?: boolean }): React.ReactElement {
    return (
        <header className="relative border-b border-line">
            <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-4">
                {showLogo && (
                    <Link href="/" className="shrink-0 text-foreground">
                        <Logo className="h-6 w-auto" />
                    </Link>
                )}
                <nav className="ml-auto flex items-center gap-4">
                    <div className="hidden md:block">
                        <InfoMenu />
                    </div>
                    <ThemeToggle />
                    <Link href="/sign-in" className="text-sm text-muted hover:text-foreground">
                        Sign in
                    </Link>

                    <Link
                        href="/sign-up"
                        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover"
                    >
                        Get started
                    </Link>
                    <div className="md:hidden">
                        <MobileMenu links={INFO_LINKS} />
                    </div>
                </nav>
            </div>
        </header>
    );
}
