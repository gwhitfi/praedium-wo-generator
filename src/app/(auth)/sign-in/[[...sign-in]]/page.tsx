import { SignIn } from "@clerk/nextjs";
import Link from "next/link";

export default function Page() {
    return (
        <main className="flex min-h-screen flex-col items-center justify-center gap-4">
            <SignIn />
            <p className="max-w-sm text-center text-xs text-subtle">
                By signing in you agree to the{" "}
                <Link href="/terms" className="underline hover:text-foreground">
                    Terms of Service
                </Link>{" "}
                and{" "}
                <Link href="/privacy" className="underline hover:text-foreground">
                    Privacy Policy
                </Link>
                .
            </p>
        </main>
    );
}
