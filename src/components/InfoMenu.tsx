"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { INFO_LINKS } from "@/lib/defaults";
import { MenuIcon } from "./MobileMenu";

// The About, FAQ and Contact links, folded into one small button in the desktop header.
// Closes on picking a link, clicking outside, Escape, or tabbing away.
export default function InfoMenu(): React.ReactElement {
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
                    <ul id={menuId} className="min-w-36 rounded-lg border border-line bg-surface py-1 shadow-lg">
                        {INFO_LINKS.map((link) => (
                            <li key={link.href}>
                                <Link
                                    href={link.href}
                                    onClick={() => setOpen(false)}
                                    className="block px-3 py-1.5 text-sm text-muted hover:bg-surface-hover hover:text-foreground"
                                >
                                    {link.label}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
