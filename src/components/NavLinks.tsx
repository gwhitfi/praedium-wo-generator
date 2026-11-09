"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavLink } from "./MobileMenu";

// True when `pathname` is the link's page or one under it. The dashboard ("/") only matches itself.
export function isActive(pathname: string, href: string): boolean {
    return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

// The look of a header icon button for the page you're on (Search, Draft with AI, the bell on /inbox).
export const ACTIVE_ICON_CLASS = "bg-surface-hover text-foreground";

// A header icon link (Search, Draft with AI) that shows when you're on its page.
export function NavIconLink({
    href,
    className,
    children,
    ...rest
}: { href: string; className: string; children: React.ReactNode } & Omit<
    React.AnchorHTMLAttributes<HTMLAnchorElement>,
    "href" | "className"
>): React.ReactElement {
    const active = isActive(usePathname(), href);
    return (
        <Link
            href={href}
            aria-current={active ? "page" : undefined}
            className={`${className} ${active ? ACTIVE_ICON_CLASS : ""}`}
            {...rest}
        >
            {children}
        </Link>
    );
}

// The main links as a row of tabs under the header on phones, so they're always one tap away.
export function MobileNavTabs({ links }: { links: NavLink[] }): React.ReactElement {
    const pathname = usePathname();

    return (
        <nav aria-label="Main" className="border-t border-line md:hidden">
            <ul className="mx-auto flex max-w-5xl overflow-x-auto px-2">
                {links.map((link) => {
                    const active = isActive(pathname, link.href);
                    return (
                        <li key={link.href} className="shrink-0">
                            <Link
                                href={link.href}
                                aria-current={active ? "page" : undefined}
                                className={`flex h-11 items-center border-b-2 px-3 text-sm ${
                                    active
                                        ? "border-accent font-medium text-foreground"
                                        : "border-transparent text-muted hover:text-foreground"
                                }`}
                            >
                                {link.label}
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}

// The signed-in header's main links on wide screens, with the current section underlined and marked for
// screen readers.
export default function NavLinks({ links }: { links: NavLink[] }): React.ReactElement {
    const pathname = usePathname();

    return (
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {links.map((link) => {
                const active = isActive(pathname, link.href);
                return (
                    <Link
                        key={link.href}
                        href={link.href}
                        aria-current={active ? "page" : undefined}
                        className={`relative rounded-md px-3 py-2 text-sm transition-colors hover:bg-surface-hover hover:text-foreground ${
                            active
                                ? "font-medium text-foreground after:absolute after:inset-x-3 after:-bottom-[13px] after:h-0.5 after:rounded-full after:bg-accent"
                                : "text-muted"
                        }`}
                    >
                        {link.label}
                    </Link>
                );
            })}
        </nav>
    );
}
