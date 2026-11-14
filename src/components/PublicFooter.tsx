import Link from "next/link";
import Logo from "./Logo";
import { INFO_LINKS } from "@/lib/defaults";
import { SUPPORT_EMAIL } from "@/lib/support";

// The footer for signed-out pages: the logo, a line about the product, and the demo, sign-in and legal links.
export default function PublicFooter(): React.ReactElement {
    return (
        <footer className="border-t border-line">
            <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-start sm:justify-between">
                <div className="max-w-xs">
                    <Logo className="h-5 w-auto text-foreground" />
                    <p className="mt-2 text-sm text-muted">Work orders for small property managers and their contractors.</p>
                </div>
                <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted [&>a]:py-1.5">
                    <Link href="/demo" className="hover:text-foreground">
                        Demo
                    </Link>
                    <Link href="/sign-in" className="hover:text-foreground">
                        Sign in
                    </Link>
                    {INFO_LINKS.map((link) => (
                        <Link key={link.href} href={link.href} className="hover:text-foreground">
                            {link.label}
                        </Link>
                    ))}
                    {/* The same address the Terms and Privacy pages give for questions. */}
                    <a href={`mailto:${SUPPORT_EMAIL}?subject=Praedium`} className="hover:text-foreground">
                        Contact
                    </a>
                </nav>
            </div>
            <p className="mx-auto max-w-5xl px-4 pb-8 text-xs text-subtle">&copy; {new Date().getFullYear()} Praedium</p>
        </footer>
    );
}
