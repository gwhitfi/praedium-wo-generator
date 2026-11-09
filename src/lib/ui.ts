// Shared class names for the UI building blocks, so buttons, cards and badges look the same on every page.
// Safe to import from server and client components.

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "danger-outline" | "danger-ghost";
export type ButtonSize = "sm" | "md" | "lg";

const BUTTON_BASE =
    "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors " +
    "hover:cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 " +
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

// A disabled primary button turns grey rather than dimming the green, so it never looks like a pressable one.
const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
    primary:
        "bg-accent text-on-accent hover:bg-accent-hover disabled:bg-surface-hover disabled:text-subtle disabled:opacity-100",
    secondary: "border border-line-strong bg-surface text-foreground hover:border-line-hover hover:bg-surface-hover",
    ghost: "text-muted hover:bg-surface-hover hover:text-foreground",
    danger: "bg-danger-strong text-white hover:bg-danger-strong/85",
    "danger-outline": "border border-danger/50 bg-surface text-danger hover:border-danger hover:bg-danger/10",
    "danger-ghost": "text-danger hover:bg-danger/10",
};

// Heights: 32px, 40px and 44px. Small buttons get a 40px touch target on phones.
const BUTTON_SIZES: Record<ButtonSize, string> = {
    sm: "h-10 px-3 text-sm sm:h-8",
    md: "h-10 px-4 text-sm",
    lg: "h-11 px-5 text-base",
};

export function buttonClass({
    variant = "secondary",
    size = "md",
    full = false,
    className = "",
}: { variant?: ButtonVariant; size?: ButtonSize; full?: boolean; className?: string } = {}): string {
    return `${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]} ${full ? "w-full" : ""} ${className}`.trim();
}

// A square button holding only an icon (header, card toolbars). Always give it an aria-label.
export function iconButtonClass({ size = "md", className = "" }: { size?: "sm" | "md"; className?: string } = {}): string {
    // Small ones are 32px with a mouse and 40px on touch screens.
    const box = size === "sm" ? "h-10 w-10 pointer-fine:h-8 pointer-fine:w-8" : "h-10 w-10";
    return (
        `inline-flex ${box} shrink-0 items-center justify-center rounded-md text-muted transition-colors ` +
        "hover:cursor-pointer hover:bg-surface-hover hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 " +
        `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${className}`
    ).trim();
}

// A text link inside running text or under a heading.
export const textLinkClass =
    "font-medium text-accent underline-offset-4 hover:text-accent-hover hover:underline hover:cursor-pointer";

// Cards: a bordered surface. `cardPadding` is the usual inside spacing.
export const cardClass = "rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.05)]";
export const cardPadding = "p-4 sm:p-5";

// A card's own title ("Next step", "Notes for the contractor"), in sentence case. Small all-caps labels are kept for
// table headers and DetailList keys, where they mark a column or a fact rather than a section.
export const cardTitleClass = "text-sm font-semibold text-foreground";

// A section heading inside a page.
export const sectionTitleClass = "text-lg font-semibold text-foreground";

// Pill badges. Pass the color classes from STATUS_COLORS or PRIORITY_STYLES.
export const badgeClass =
    "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[0.8125rem] font-medium leading-4";

// The smallest text that still carries information people act on (hints, dates, secondary lines): 13px.
export const smallTextClass = "text-[0.8125rem] leading-5";

// Message boxes, one per meaning. Info is neutral; success, warning and danger use their color.
export const noticeClass = {
    info: "rounded-lg border border-line-strong/60 bg-surface px-4 py-3 text-sm text-secondary",
    success: "rounded-lg border border-success/40 bg-success/10 px-4 py-3 text-sm text-foreground",
    warning: "rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground",
    danger: "rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger",
} as const;

// A heading's id from its text, for "On this page" links: "4. Your content" → "your-content".
export function headingId(text: string): string {
    return text
        .toLowerCase()
        .replace(/^\d+\.\s*/, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}

// Page containers. Every signed-in page shares one width so the content lines up with the header.
export const pageClass = "mx-auto w-full max-w-5xl px-4 pt-6 pb-16 sm:pt-8";
// Forms and long text read best narrower; they stay left-aligned inside the page.
export const readingClass = "max-w-2xl";
// Focused one-task pages (create and edit forms): a single centered column, like GitHub's "New repository".
export const taskPageClass = "mx-auto w-full max-w-2xl px-4 pt-6 pb-16 sm:pt-8";
