import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { formatPhone } from "@/lib/phone";
import OrganizationContactForm from "./OrganizationContactForm";
import AiPreferenceForm from "./AiPreferenceForm";

export default async function Settings() {
    const result = await getCurrentUser();

    if (result.state === "signed-out") {
        redirect("/sign-in");
    }

    if (result.state === "needs-org") {
        redirect("/setup");
    }

    const { organization, user } = result;

    return (
        <main className="mx-auto max-w-3xl px-4 py-10 text-foreground">
            <div className="mb-8">
                <h1 className="text-2xl font-semibold">Settings</h1>
                <p className="mt-1 text-sm text-subtle">Manage your organization and your own preferences.</p>
            </div>

            <section className="mb-10">
                <GroupHeading title="Organization" description={`Shared by everyone in ${organization.name}.`} />
                <OrganizationContactForm
                    name={organization.name}
                    phone={organization.phone ? formatPhone(organization.phone) : null}
                    email={organization.email}
                />
            </section>

            <section>
                <GroupHeading
                    title="Your preferences"
                    description="Only you see these; they don't change anything for others in your organization."
                />
                <AiPreferenceForm aiEnabled={user.aiEnabled !== false} />
            </section>
        </main>
    );
}

function GroupHeading({ title, description }: { title: string; description: string }) {
    return (
        <div className="mb-3">
            <h2 className="text-xs font-medium uppercase tracking-wide text-subtle">{title}</h2>
            <p className="mt-1 text-sm text-muted">{description}</p>
        </div>
    );
}
