import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { themeScript } from "@/lib/theme";
import { ToastProvider } from "@/components/Toaster";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

export const metadata: Metadata = {
    title: { default: "Praedium", template: "%s · Praedium" },
    description: "Work orders for every property you manage: build them room by room, send contractors a link, and track the work.",
};

// Clerk's sign-in, sign-up, user menu and organization widgets in Praedium's colors and font. The values are the
// --ck-* aliases of the theme colors (globals.css), so the widgets follow light and dark mode and the chosen palette
// along with the app. (Clerk uses names like --accent internally, so the theme's own names can't be passed.)
const clerkAppearance = {
    variables: {
        colorPrimary: "var(--ck-accent)",
        colorPrimaryForeground: "var(--ck-on-accent)",
        colorBackground: "var(--ck-surface)",
        colorForeground: "var(--ck-foreground)",
        colorMuted: "var(--ck-surface-hover)",
        colorMutedForeground: "var(--ck-muted)",
        colorNeutral: "var(--ck-foreground)",
        colorInput: "var(--ck-surface)",
        colorInputForeground: "var(--ck-foreground)",
        colorBorder: "var(--ck-line-strong)",
        colorRing: "var(--ck-accent)",
        colorDanger: "var(--ck-danger)",
        colorSuccess: "var(--ck-success)",
        colorWarning: "var(--ck-warning)",
        colorModalBackdrop: "rgb(0 0 0 / 0.6)",
        fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
        borderRadius: "0.5rem",
    },
    // The main button in the app's plain button style, without Clerk's gradient. Clerk draws control outlines as a
    // faint shadow, nearly invisible in dark mode, so inputs and the Google button get the app's control border
    // (and its focus ring) instead.
    elements: {
        formButtonPrimary:
            "bg-(--ck-accent)! bg-none! bg-[image:none]! text-(--ck-on-accent)! shadow-none! before:hidden! after:hidden! hover:bg-(--ck-accent-hover)!",
        buttonArrowIcon: "hidden!",
        formFieldInput:
            "shadow-[0_0_0_1px_var(--ck-line-strong)]! focus:shadow-[0_0_0_1px_var(--ck-accent),0_0_0_4px_color-mix(in_srgb,var(--ck-accent)_30%,transparent)]!",
        socialButtonsBlockButton: "shadow-[0_0_0_1px_var(--ck-line-strong)]! hover:bg-(--ck-surface-hover)!",
        socialButtonsBlockButtonText: "text-(--ck-foreground)!",
    },
};

// Praedium's own headings on Clerk's sign-in and sign-up cards, in place of Clerk's generic ones.
const clerkLocalization = {
    signIn: {
        start: { title: "Sign in to Praedium", subtitle: "Welcome back. Your work orders are where you left them." },
    },
    signUp: {
        start: {
            title: "Create your Praedium account",
            subtitle: "Start sending work orders in minutes. Free while in early access.",
        },
    },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
    return (
        <ClerkProvider appearance={clerkAppearance} localization={clerkLocalization}>
            {/* The theme script sets data-theme on <html> before React loads, so React must not flag the mismatch. */}
            <html
                lang="en"
                className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
                suppressHydrationWarning
            >
                <head>
                    <script dangerouslySetInnerHTML={{ __html: themeScript }} />
                </head>
                <body className="min-h-full">
                    {/* Every page's <main> has id="main". Hidden until a keyboard user tabs to it. */}
                    <a
                        href="#main"
                        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-on-accent"
                    >
                        Skip to content
                    </a>
                    <ToastProvider>{children}</ToastProvider>
                </body>
            </html>
        </ClerkProvider>
    );
}
