import type { Metadata } from "next";
import { SignIn } from "@clerk/nextjs";
import AuthFrame from "@/components/AuthFrame";

export const metadata: Metadata = { title: "Sign in" };

export default function Page() {
    return (
        <AuthFrame agreement="By signing in you agree to the">
            <SignIn />
        </AuthFrame>
    );
}
