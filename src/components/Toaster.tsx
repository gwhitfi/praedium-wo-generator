"use client";

import { createContext, Suspense, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckIcon, InfoIcon, XIcon, AlertIcon } from "./Icons";

type Tone = "success" | "info" | "error";
// A button in the toast, such as "Undo".
type ToastAction = { label: string; onClick: () => void | Promise<void> };
type Toast = { id: number; message: string; tone: Tone; action?: ToastAction };
type ShowToast = (message: string, tone?: Tone, action?: ToastAction) => void;

const ToastContext = createContext<ShowToast>(() => {});

// Shows a short confirmation ("Sent to …", "Link copied") at the bottom of the screen for a few seconds, with an
// optional action button ("Undo"). Toasts with an action stay a little longer.
export function useToast(): ShowToast {
    return useContext(ToastContext);
}

// Messages for ?flash=… on the page a Server Action redirected to, so "created" and "saved" are confirmed too.
const FLASH_MESSAGES: Record<string, string> = {
    "work-order-created": "Work order created. Add areas and line items next.",
    "work-order-saved": "Changes saved.",
    "contact-created": "Contact added.",
    "contact-saved": "Contact saved.",
    "property-created": "Property added.",
    "property-saved": "Property saved.",
};

const DURATION_MS = 4500;

export function ToastProvider({ children }: { children: React.ReactNode }): React.ReactElement {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const nextId = useRef(1);

    const dismiss = useCallback((id: number) => setToasts((current) => current.filter((t) => t.id !== id)), []);

    // Each toast times itself out (ToastItem), pausing while the pointer or keyboard focus is on it.
    const show = useCallback<ShowToast>((message, tone = "success", action) => {
        const id = nextId.current++;
        // Keep at most three on screen.
        setToasts((current) => [...current.slice(-2), { id, message, tone, action }]);
    }, []);

    return (
        <ToastContext.Provider value={show}>
            {children}
            <Suspense fallback={null}>
                <FlashListener show={show} />
            </Suspense>
            <div
                role="status"
                aria-live="polite"
                className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end print:hidden"
            >
                {toasts.map((toast) => (
                    <ToastItem key={toast.id} toast={toast} dismiss={dismiss} />
                ))}
            </div>
        </ToastContext.Provider>
    );
}

// One toast. It goes away after DURATION_MS (twice that with an action button), but the countdown stops while the
// pointer is over it or focus is inside it, and starts again when they leave, so an Undo can't vanish mid-reach.
function ToastItem({ toast, dismiss }: { toast: Toast; dismiss: (id: number) => void }): React.ReactElement {
    const [paused, setPaused] = useState(false);
    const hovered = useRef(false);
    const focused = useRef(false);
    const update = () => setPaused(hovered.current || focused.current);
    const onDismiss = () => dismiss(toast.id);

    useEffect(() => {
        if (paused) return;
        const timer = setTimeout(() => dismiss(toast.id), toast.action ? DURATION_MS * 2 : DURATION_MS);
        return () => clearTimeout(timer);
    }, [paused, dismiss, toast.id, toast.action]);

    return (
        <div
            onPointerEnter={() => {
                hovered.current = true;
                update();
            }}
            onPointerLeave={() => {
                hovered.current = false;
                update();
            }}
            onFocus={() => {
                focused.current = true;
                update();
            }}
            onBlur={(event) => {
                if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                focused.current = false;
                update();
            }}
            className="pointer-events-auto flex w-full max-w-sm animate-toast-in items-center gap-3 rounded-lg border border-line-strong/70 bg-surface py-2 pr-2 pl-4 text-sm text-foreground shadow-lg"
        >
            <span
                className={`shrink-0 ${
                    toast.tone === "success" ? "text-success" : toast.tone === "error" ? "text-danger" : "text-muted"
                }`}
            >
                {toast.tone === "success" ? <CheckIcon /> : toast.tone === "error" ? <AlertIcon /> : <InfoIcon />}
            </span>
            <p className="min-w-0 flex-1 py-1">{toast.message}</p>
            {toast.action && (
                <button
                    type="button"
                    onClick={() => {
                        onDismiss();
                        void toast.action?.onClick();
                    }}
                    className="h-9 shrink-0 rounded-md px-2.5 text-sm font-semibold text-accent hover:cursor-pointer hover:bg-accent/10"
                >
                    {toast.action.label}
                </button>
            )}
            <button
                type="button"
                onClick={onDismiss}
                aria-label="Dismiss"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-subtle hover:cursor-pointer hover:bg-surface-hover hover:text-foreground"
            >
                <XIcon size={14} />
            </button>
        </div>
    );
}

// Shows the toast for ?flash=… once, then takes the parameter out of the address bar.
function FlashListener({ show }: { show: ShowToast }) {
    const params = useSearchParams();
    const pathname = usePathname();
    const router = useRouter();
    const flash = params.get("flash");

    useEffect(() => {
        if (!flash) return;
        const message = FLASH_MESSAGES[flash];
        if (message) show(message);
        const rest = new URLSearchParams(params);
        rest.delete("flash");
        const query = rest.toString();
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }, [flash, params, pathname, router, show]);

    return null;
}
