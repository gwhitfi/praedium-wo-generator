"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavLink = { href: string; label: string };

export default function MobileMenu({ links }: { links: NavLink[] }): React.ReactElement {
    const pathname = usePathname();
    // Remembering the page it was opened on closes the menu on any navigation, including the back button.
    const [openOn, setOpenOn] = useState<string | null>(null);
    const open = openOn === pathname;

    useEffect(() => {
        if (!open) return;
        function onKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") setOpenOn(null);
        }
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [open]);

    return (
        <>
            <button
                type="button"
                onClick={() => setOpenOn(open ? null : pathname)}
                aria-expanded={open}
                aria-controls="mobile-menu"
                aria-label={open ? "Close menu" : "Open menu"}
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground hover:cursor-pointer"
            >
                {open ? <CloseIcon /> : <MenuIcon />}
            </button>
            {open && (
                <nav
                    id="mobile-menu"
                    className="absolute inset-x-0 top-full z-30 border-b border-line bg-surface px-4 py-2 shadow-lg"
                >
                    {links.map((link) => (
                        <Link
                            key={link.href}
                            href={link.href}
                            onClick={() => setOpenOn(null)}
                            className="block rounded-md px-2 py-3 text-muted hover:bg-surface-hover hover:text-foreground"
                        >
                            {link.label}
                        </Link>
                    ))}
                </nav>
            )}
        </>
    );
}

const iconProps = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
} as const;

export function MenuIcon() {
    return (
        <svg {...iconProps}>
            <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
    );
}

function CloseIcon() {
    return (
        <svg {...iconProps}>
            <path d="M6 6l12 12M18 6L6 18" />
        </svg>
    );
}
