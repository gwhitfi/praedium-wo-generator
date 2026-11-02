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

const AI_LINK: NavLink = { href: "/work-orders/new/ai", label: "Create work order with AI" };

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
                    <Link
                        href={AI_LINK.href}
                        aria-label={AI_LINK.label}
                        title={AI_LINK.label}
                        className="flex h-8 w-8 items-center justify-center rounded-md text-accent hover:bg-surface-hover hover:text-accent-hover"
                    >
                        <SparklesIcon />
                    </Link>
                    <ThemeToggle />
                    <UserButton />
                    <div className="md:hidden">
                        <MobileMenu links={[...links, AI_LINK, ...INFO_LINKS]} />
                    </div>
                </div>
            </div>
        </header>
    );
}

function SparklesIcon() {
    return (
        <svg
            width={18}
            height={18}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
        >
            <path d="M10 3l1.9 5.1L17 10l-5.1 1.9L10 17l-1.9-5.1L3 10l5.1-1.9L10 3Z" />
            <path d="M19 15v6M16 18h6" />
        </svg>
    );
}
