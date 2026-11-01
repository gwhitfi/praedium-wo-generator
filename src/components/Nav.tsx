import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import ThemeToggle from "./ThemeToggle";
import Logo from "./Logo";
import MobileMenu, { type NavLink } from "./MobileMenu";
import InfoMenu from "./InfoMenu";
import { INFO_LINKS } from "@/lib/defaults";

const links: NavLink[] = [
    { href: "/work-orders", label: "Work Orders" },
    { href: "/contacts", label: "Contacts" },
    { href: "/properties", label: "Properties" },
    { href: "/settings", label: "Settings" },
];

export default function Nav() {
    return (
        <header className="relative border-b border-line print:hidden">
            <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
                <Link href="/" className="shrink-0 text-foreground">
                    <Logo className="h-6 w-auto" />
                </Link>
                <div className="flex shrink-0 items-center gap-3 md:gap-6">
                    <nav className="hidden items-center gap-6 md:flex">
                        {links.map((link) => (
                            <Link key={link.href} href={link.href} className="text-sm text-muted hover:text-foreground">
                                {link.label}
                            </Link>
                        ))}
                        <InfoMenu />
                    </nav>
                    <ThemeToggle />
                    <UserButton />
                    <div className="md:hidden">
                        <MobileMenu links={[...links, ...INFO_LINKS]} />
                    </div>
                </div>
            </div>
        </header>
    );
}
