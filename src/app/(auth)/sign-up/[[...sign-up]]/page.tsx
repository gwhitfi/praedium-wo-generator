import type { Metadata } from "next";
import { SignUp } from "@clerk/nextjs";
import AuthFrame from "@/components/AuthFrame";

export const metadata: Metadata = { title: "Create your account" };

export default function Page() {
    return (
        <AuthFrame agreement="By creating an account you agree to the">
            <SignUp />
        </AuthFrame>
    );
}
