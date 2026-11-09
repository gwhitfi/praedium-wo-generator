import type { Metadata } from "next";
import { OrganizationList } from "@clerk/nextjs";
import Logo from "@/components/Logo";

export const metadata: Metadata = { title: "Choose your organization" };

// Shown when the signed-in user has no active organization: after sign-up, and after leaving one. Lists the
// organizations they still belong to (and pending invitations) with a create option. No personal accounts: the app
// needs an organization.
export default function Page() {
    return (
        <main id="main" className="flex min-h-screen flex-col items-center px-4 py-10 text-foreground">
            <Logo className="h-7 w-auto" />
            <div className="flex w-full flex-1 flex-col items-center justify-center gap-4 py-10 text-center">
                <div className="max-w-md">
                    <h1 className="text-2xl font-semibold tracking-tight">Set up your organization</h1>
                    <p className="mt-2 text-sm text-muted">
                        Your properties, contacts and work orders belong to an organization, usually your company.
                        Create one, or join one you&apos;ve been invited to.
                    </p>
                </div>
                <OrganizationList hidePersonal afterSelectOrganizationUrl="/" afterCreateOrganizationUrl="/" />
            </div>
        </main>
    );
}
