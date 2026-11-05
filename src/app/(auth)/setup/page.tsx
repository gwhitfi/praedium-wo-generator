import { OrganizationList } from "@clerk/nextjs";

// Shown when the signed-in user has no active organization: after sign-up, and after leaving one. Lists the
// organizations they still belong to (and pending invitations) with a create option. No personal accounts: the app
// needs an organization.
export default function Page() {
    return (
        <main className="flex-min-h-screen items-center justify-center">
            <OrganizationList hidePersonal afterSelectOrganizationUrl="/" afterCreateOrganizationUrl="/" />
        </main>
    );
}
