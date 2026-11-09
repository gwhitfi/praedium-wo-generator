import Link from "next/link";
import Logo from "./Logo";
import { type NavLink } from "./MobileMenu";
import NavMenu from "./NavMenu";
import NavLinks, { MobileNavTabs, NavIconLink } from "./NavLinks";
import NotificationBell from "./NotificationBell";
import { SearchIcon, SparklesIcon } from "./Icons";
import { INFO_LINKS } from "@/lib/defaults";
import { iconButtonClass } from "@/lib/ui";

const links: NavLink[] = [
    { href: "/", label: "Dashboard" },
    { href: "/work-orders", label: "Work orders" },
    { href: "/contacts", label: "Contacts" },
    { href: "/properties", label: "Properties" },
];

const AI_LINK = { href: "/work-orders/new/ai", label: "Draft with AI", title: "Praedium Bot: draft a work order with AI" };

// `showAi` is true only once the user has turned Praedium Bot on (it starts off).
export default function Nav({ showAi, unreadCount }: { showAi: boolean; unreadCount: number }) {
    return (
        <header className="sticky top-0 z-40 border-b border-line bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/80 print:hidden">
            <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4">
                <div className="flex min-w-0 items-center gap-6">
                    <Link href="/" aria-label="Praedium dashboard" className="shrink-0 rounded text-foreground">
                        <Logo className="h-6 w-auto" />
                    </Link>
                    <NavLinks links={links} />
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    <NavIconLink href="/search" aria-label="Search" title="Search" className={iconButtonClass()}>
                        <SearchIcon size={18} />
                    </NavIconLink>
                    {showAi && (
                        // Labelled "AI" on small screens and "Draft with AI" on wide ones, never a bare icon.
                        <NavIconLink
                            href={AI_LINK.href}
                            title={AI_LINK.title}
                            aria-label={AI_LINK.title}
                            className={`${iconButtonClass()} w-auto! gap-1 px-2 text-accent hover:text-accent-hover lg:gap-1.5 lg:px-3`}
                        >
                            <SparklesIcon size={18} />
                            <span className="text-sm font-medium lg:hidden">AI</span>
                            <span className="hidden text-sm font-medium lg:inline">{AI_LINK.label}</span>
                        </NavIconLink>
                    )}
                    <NotificationBell unreadCount={unreadCount} />
                    <NavMenu infoLinks={INFO_LINKS} />
                </div>
            </div>
            <MobileNavTabs links={links} />
        </header>
    );
}
