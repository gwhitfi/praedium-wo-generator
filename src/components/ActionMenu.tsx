"use client";

import { useEffect, useId, useRef, useState } from "react";
import { MoreIcon } from "./Icons";
import { iconButtonClass } from "@/lib/ui";

export type MenuAction = {
    label: string;
    onSelect: () => void;
    icon?: React.ReactNode;
    danger?: boolean;
    disabled?: boolean;
};

// A "⋯" button that opens a short menu of actions for one thing (a line item, an area, a unit). Always visible, so
// nothing depends on hovering. Follows the ARIA menu button pattern: arrow keys move, Enter or Space picks,
// Escape closes and returns focus to the button.
export default function ActionMenu({
    label,
    actions,
    size = "sm",
    buttonId,
}: {
    // What the menu is for, read out on the button: "Actions for Kitchen".
    label: string;
    actions: MenuAction[];
    size?: "sm" | "md";
    // An id for the "⋯" button, so focus can be put back on it after an inline edit it started.
    buttonId?: string;
}): React.ReactElement {
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    const rootRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
    const menuId = useId();
    const enabled = actions.map((action, index) => (action.disabled ? -1 : index)).filter((i) => i >= 0);

    function openAt(index: number) {
        setActive(index);
        setOpen(true);
    }

    function close(focusButton = true) {
        setOpen(false);
        if (focusButton) buttonRef.current?.focus();
    }

    useEffect(() => {
        if (!open) return;
        itemRefs.current[active]?.focus();
    }, [open, active]);

    useEffect(() => {
        if (!open) return;
        function onPointerDown(event: PointerEvent) {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
        }
        document.addEventListener("pointerdown", onPointerDown);
        return () => document.removeEventListener("pointerdown", onPointerDown);
    }, [open]);

    function move(step: number) {
        const position = enabled.indexOf(active);
        const next = enabled[(position + step + enabled.length) % enabled.length];
        if (next !== undefined) setActive(next);
    }

    return (
        <div ref={rootRef} className="relative">
            <button
                ref={buttonRef}
                id={buttonId}
                type="button"
                aria-haspopup="menu"
                aria-expanded={open}
                aria-controls={open ? menuId : undefined}
                aria-label={label}
                title="More actions"
                onClick={() => (open ? close() : openAt(enabled[0] ?? 0))}
                onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                        event.preventDefault();
                        openAt(enabled[0] ?? 0);
                    } else if (event.key === "ArrowUp") {
                        event.preventDefault();
                        openAt(enabled[enabled.length - 1] ?? 0);
                    }
                }}
                className={iconButtonClass({ size })}
            >
                <MoreIcon size={18} />
            </button>
            {open && (
                <ul
                    id={menuId}
                    role="menu"
                    aria-label={label}
                    onKeyDown={(event) => {
                        if (event.key === "ArrowDown") {
                            event.preventDefault();
                            move(1);
                        } else if (event.key === "ArrowUp") {
                            event.preventDefault();
                            move(-1);
                        } else if (event.key === "Home") {
                            event.preventDefault();
                            setActive(enabled[0] ?? 0);
                        } else if (event.key === "End") {
                            event.preventDefault();
                            setActive(enabled[enabled.length - 1] ?? 0);
                        } else if (event.key === "Escape") {
                            event.preventDefault();
                            close();
                        } else if (event.key === "Tab") {
                            close(false);
                        }
                    }}
                    className="absolute right-0 top-full z-30 mt-1 min-w-48 rounded-lg border border-line bg-surface py-1 shadow-xl"
                >
                    {actions.map((action, index) => (
                        <li key={action.label} role="none">
                            <button
                                ref={(element) => {
                                    itemRefs.current[index] = element;
                                }}
                                type="button"
                                role="menuitem"
                                tabIndex={index === active ? 0 : -1}
                                disabled={action.disabled}
                                onClick={() => {
                                    close();
                                    action.onSelect();
                                }}
                                className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:cursor-pointer hover:bg-surface-hover focus:bg-surface-hover focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 sm:py-2 ${
                                    action.danger ? "text-danger" : "text-foreground"
                                }`}
                            >
                                {action.icon && <span className="shrink-0 text-current opacity-80">{action.icon}</span>}
                                {action.label}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
