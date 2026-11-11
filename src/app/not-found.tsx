import Link from "next/link";
import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import Nav from "@/components/Nav";
import PublicHeader from "@/components/PublicHeader";
import { navUnreadCount } from "@/lib/notifications";
import { SearchIcon } from "@/components/Icons";
import { buttonClass } from "@/lib/ui";

// Page not found, inside the header the visitor would normally see, with a way back that fits who they are.
export default async function NotFound() {
    // The proxy skips Clerk for static-looking paths (/favicon.ico, /_next/...), and Clerk's auth() throws when its
    // middleware didn't run, so a missing file of that kind gets the signed-out page.
    const clerkRan = (await headers()).get("x-clerk-auth-status") !== null;
    const result = clerkRan ? await getCurrentUser() : null;
    const ready = result?.state === "ready" ? result : null;
    const signedIn = ready !== null;
    const unreadCount = ready ? await navUnreadCount(ready.user, ready.organization.id) : 0;

    return (
        <div className="min-h-screen text-foreground">
            {ready ? <Nav showAi={ready.user.aiEnabled === true} unreadCount={unreadCount} /> : <PublicHeader />}
            <main id="main" className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-hover text-muted">
                    <SearchIcon size={22} />
                </div>
                <p className="mt-6 text-sm font-semibold text-accent">404</p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight">We couldn&apos;t find that page</h1>
                <p className="mt-3 text-muted">
                    The link may be mistyped, or what it pointed to was deleted.
                    {signedIn && " Archived items are still there: open a list and choose Show archived."}
                </p>
                <div className="mt-8 flex flex-col gap-2 sm:flex-row">
                    {signedIn ? (
                        <>
                            <Link href="/" className={buttonClass({ variant: "primary" })}>
                                Go to the dashboard
                            </Link>
                            <Link href="/search" className={buttonClass()}>
                                Search
                            </Link>
                        </>
                    ) : (
                        <>
                            <Link href="/" className={buttonClass({ variant: "primary" })}>
                                Go to the home page
                            </Link>
                            <Link href="/sign-in" className={buttonClass()}>
                                Sign in
                            </Link>
                        </>
                    )}
                </div>
            </main>
        </div>
    );
}
