"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { OrganizationSwitcher, SignOutButton, UserButton, useUser } from "@clerk/nextjs";
import ThemeToggle from "./ThemeToggle";
import { type NavLink } from "./MobileMenu";
import { LogOutIcon, SlidersIcon, XIcon } from "./Icons";
import { ACTIVE_ICON_CLASS, isActive } from "./NavLinks";
import { iconButtonClass } from "@/lib/ui";

// "JW" from "Justin Whitfield", or the first letter of the email when there's no name; "?" until Clerk has loaded.
function accountInitials(name: string | null | undefined, email: string | null | undefined): string {
    const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
    if (words.length > 0) return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
    return email ? email[0].toUpperCase() : "?";
}

// Clerk renders its popovers and modals in a portal outside the menu; every element in them has a `cl-` class.
function insideClerk(target: EventTarget | null): boolean {
    return target instanceof Element && target.closest('[class^="cl-"], [class*=" cl-"]') !== null;
}

// The signed-in header's menu, at the far right on every screen size. Grouped as: your account and organization,
// Settings, the theme and Sign out, then the legal pages. (The main pages are in the header, as tabs on phones.)
// Closes on picking a link, clicking outside, Escape, or tabbing away. Clerk's popovers and modals (from the user
// button and organization switcher) don't count as outside. On phones it dims the page behind it.
export default function NavMenu({ infoLinks }: { infoLinks: NavLink[] }): React.ReactElement {
    const pathname = usePathname();
    const onSettings = isActive(pathname, "/settings");
    const { user } = useUser();
    const initials = accountInitials(user?.fullName, user?.primaryEmailAddress?.emailAddress);
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const menuId = useId();

    useEffect(() => {
        if (!open) return;

        function onPointerDown(event: PointerEvent) {
            if (insideClerk(event.target)) return;
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

    const linkClass = (active: boolean) =>
        `flex items-center gap-3 rounded-md px-3 py-2.5 text-sm hover:bg-surface-hover hover:text-foreground md:py-2 ${
            active ? "bg-surface-hover/70 font-medium text-foreground" : "text-secondary"
        }`;
    const close = () => setOpen(false);

    return (
        <div
            ref={rootRef}
            className="relative"
            onBlur={(event) => {
                if (insideClerk(event.relatedTarget)) return;
                if (!rootRef.current?.contains(event.relatedTarget)) setOpen(false);
            }}
        >
            {/* The account button: the user's initials (not a ☰, since the main pages are already in the header).
                Marked when you're on Settings, which lives in this menu. */}
            <button
                ref={buttonRef}
                type="button"
                aria-expanded={open}
                aria-controls={menuId}
                aria-label={open ? "Close account menu" : "Account menu"}
                title="Account and settings"
                onClick={() => setOpen(!open)}
                className={`${iconButtonClass()} ${onSettings ? ACTIVE_ICON_CLASS : ""}`}
            >
                {open ? (
                    <XIcon size={20} />
                ) : (
                    // Clerk may only know the user once the browser takes over, so the letters can differ from the
                    // server's "?" for a moment.
                    <span
                        aria-hidden
                        suppressHydrationWarning
                        className={`flex h-8 w-8 items-center justify-center rounded-full border text-[0.8125rem] font-semibold ${
                            onSettings ? "border-accent text-foreground" : "border-line-strong text-secondary"
                        }`}
                    >
                        {initials}
                    </span>
                )}
            </button>

            {open && (
                <>
                    {/* Dims the page on phones, where the menu covers most of it. Clicking it closes the menu.
                        The header's backdrop blur makes it the box that "fixed" is measured from, so the height is set
                        explicitly; the header is always at the top of the screen. */}
                    <div
                        aria-hidden
                        onClick={close}
                        className="fixed inset-x-0 top-16 z-20 h-[100dvh] bg-black/50 md:hidden"
                    />
                    <div className="fixed inset-x-3 top-[4.25rem] z-30 md:absolute md:inset-x-auto md:right-0 md:top-full md:pt-2">
                        <div
                            id={menuId}
                            className="max-h-[calc(100dvh-5.5rem)] overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-xl md:w-72"
                        >
                            <div className="mb-1 flex flex-col gap-2 border-b border-line px-2.5 pt-2 pb-3">
                                <UserButton showName />
                                <OrganizationSwitcher
                                    hidePersonal
                                    afterSelectOrganizationUrl="/"
                                    afterCreateOrganizationUrl="/"
                                    afterLeaveOrganizationUrl="/setup"
                                />
                            </div>
                            <div className="border-b border-line py-1">
                                <Link
                                    href="/settings"
                                    onClick={close}
                                    aria-current={onSettings ? "page" : undefined}
                                    className={linkClass(onSettings)}
                                >
                                    <SlidersIcon size={16} />
                                    Settings
                                </Link>
                                <ThemeToggle label />
                                <SignOutButton redirectUrl="/">
                                    <button type="button" className={`${linkClass(false)} w-full hover:cursor-pointer`}>
                                        <LogOutIcon size={16} />
                                        Sign out
                                    </button>
                                </SignOutButton>
                            </div>
                            <p className="flex gap-4 px-3 pt-2.5 pb-1.5 text-xs text-subtle">
                                {infoLinks.map((link) => (
                                    <Link
                                        key={link.href}
                                        href={link.href}
                                        onClick={close}
                                        className="hover:text-foreground hover:underline"
                                    >
                                        {link.label}
                                    </Link>
                                ))}
                            </p>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
