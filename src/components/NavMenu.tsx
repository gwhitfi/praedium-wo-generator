"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { UserButton } from "@clerk/nextjs";
import ThemeToggle from "./ThemeToggle";
import { MenuIcon, type NavLink } from "./MobileMenu";

// The signed-in header's hamburger menu, at the far right on every screen size. `mobileLinks` are the
// header's own links, listed here only on small screens where the header hides them.
// Closes on picking a link, clicking outside, Escape, or tabbing away.
export default function NavMenu({
    mobileLinks,
    links,
}: {
    mobileLinks: NavLink[];
    links: NavLink[];
}): React.ReactElement {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const menuId = useId();

    useEffect(() => {
        if (!open) return;

        function onPointerDown(event: PointerEvent) {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
        }
        function onKeyDown(event: KeyboardEvent) {
            if (event.key !== "Escape") return;
            setOpen(false);
            buttonRef.current?.focus();
        }

        document.addEventListener("pointerdown", onPointerDown);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("pointerdown", onPointerDown);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [open]);

    const linkClass = "block px-3 py-1.5 text-sm text-muted hover:bg-surface-hover hover:text-foreground";

    return (
        <div
            ref={rootRef}
            className="relative"
            onBlur={(event) => {
                if (!rootRef.current?.contains(event.relatedTarget)) setOpen(false);
            }}
        >
            <button
                ref={buttonRef}
                type="button"
                aria-expanded={open}
                aria-controls={menuId}
                aria-label="Menu"
                onClick={() => setOpen(!open)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground hover:cursor-pointer"
            >
                <MenuIcon />
            </button>

            {open && (
                <div className="absolute right-0 top-full z-30 pt-2">
                    <div id={menuId} className="min-w-48 rounded-lg border border-line bg-surface py-1 shadow-lg">
                        <div className="mb-1 border-b border-line px-3 pt-1 pb-2">
                            <UserButton showName />
                        </div>
                        <ul className="border-b border-line pb-1 mb-1 md:hidden">
                            {mobileLinks.map((link) => (
                                <li key={link.href}>
                                    <Link href={link.href} onClick={() => setOpen(false)} className={linkClass}>
                                        {link.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                        <ul>
                            {links.map((link) => (
                                <li key={link.href}>
                                    <Link href={link.href} onClick={() => setOpen(false)} className={linkClass}>
                                        {link.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                        <div className="mt-1 border-t border-line pt-1">
                            <ThemeToggle label />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
