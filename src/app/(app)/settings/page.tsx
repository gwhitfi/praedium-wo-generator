import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { formatPhone } from "@/lib/phone";
import { formatTimestamp } from "@/lib/dates";
import prisma from "@/lib/prisma";
import OrganizationContactForm from "./OrganizationContactForm";
import AiPreferenceForm from "./AiPreferenceForm";
import AppearanceSettings from "./AppearanceSettings";
import NotificationSettings from "./NotificationSettings";
import { resolveNotificationTypes } from "@/lib/notificationTypes";
import ApiKeyForm from "./ApiKeyForm";
import RevokeApiKeyButton from "./RevokeApiKeyButton";

export default async function Settings() {
    const result = await getCurrentUser();

    if (result.state === "signed-out") {
        redirect("/sign-in");
    }

    if (result.state === "needs-org") {
        redirect("/setup");
    }

    const { organization, user, role } = result;
    const isAdmin = role === "ADMIN";
    const apiKeys = await prisma.apiKey.findMany({
        where: { organizationId: organization.id, revokedAt: null },
        select: { id: true, name: true, prefix: true, createdAt: true, lastUsedAt: true, canChangeStatus: true },
        orderBy: { createdAt: "desc" },
    });

    return (
        <main className="mx-auto max-w-3xl px-4 py-10 text-foreground">
            <div className="mb-8">
                <h1 className="text-2xl font-semibold">Settings</h1>
                <p className="mt-1 text-sm text-subtle">Manage your organization and your own preferences.</p>
            </div>

            <section className="mb-10">
                <GroupHeading title="Organization" description={`Shared by everyone in ${organization.name}.`} />
                {isAdmin ? (
                    <OrganizationContactForm
                        name={organization.name}
                        phone={organization.phone ? formatPhone(organization.phone) : null}
                        email={organization.email}
                    />
                ) : (
                    <div className="rounded-xl border border-line bg-surface p-5 text-sm shadow-sm sm:px-6">
                        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
                            <dt className="text-muted">Name</dt>
                            <dd className="text-foreground">{organization.name}</dd>
                            <dt className="text-muted">Phone</dt>
                            <dd className="text-foreground">
                                {organization.phone ? formatPhone(organization.phone) : "Not set"}
                            </dd>
                            <dt className="text-muted">Email</dt>
                            <dd className="text-foreground">{organization.email ?? "Not set"}</dd>
                        </dl>
                        <p className="mt-4 text-muted">Only admins can change these.</p>
                    </div>
                )}
            </section>

            <section className="mb-10">
                <GroupHeading
                    title="API keys"
                    description="Let an AI assistant read and change this organization's properties, contacts and work orders, and create draft work orders. Keys marked “Can change status” can also send, cancel, archive and restore work orders. Everything a key does is attributed to the person who created it."
                />
                <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
                    {apiKeys.length === 0 ? (
                        <p className="p-5 text-sm text-muted sm:px-6">No API keys yet.</p>
                    ) : (
                        <ul className="divide-y divide-line">
                            {apiKeys.map((apiKey) => (
                                <li key={apiKey.id} className="flex items-center gap-3 px-5 py-3 sm:px-6">
                                    <div className="min-w-0 flex-1">
                                        <p className="flex items-baseline gap-2 text-sm font-medium text-foreground">
                                            <span className="truncate">{apiKey.name}</span>
                                            {apiKey.canChangeStatus && (
                                                <span className="shrink-0 text-xs font-normal text-muted">
                                                    Can change status
                                                </span>
                                            )}
                                        </p>
                                        <p className="text-xs text-subtle">
                                            <span className="font-mono">pr_{apiKey.prefix}…</span> · Created{" "}
                                            {formatTimestamp(apiKey.createdAt)} ·{" "}
                                            {apiKey.lastUsedAt
                                                ? `Last used ${formatTimestamp(apiKey.lastUsedAt)}`
                                                : "Never used"}
                                        </p>
                                    </div>
                                    {isAdmin && <RevokeApiKeyButton id={apiKey.id} name={apiKey.name} />}
                                </li>
                            ))}
                        </ul>
                    )}
                    {isAdmin ? (
                        <ApiKeyForm />
                    ) : (
                        <p className="border-t border-line px-5 py-3 text-sm text-muted sm:px-6">
                            Only admins can create or revoke API keys.
                        </p>
                    )}
                </div>
            </section>

            <section>
                <GroupHeading
                    title="Your preferences"
                    description="Only you see these; they don't change anything for others in your organization."
                />
                <div className="flex flex-col gap-6">
                    <AppearanceSettings />
                    <NotificationSettings selected={resolveNotificationTypes(user.notificationTypes)} />
                    <AiPreferenceForm aiEnabled={user.aiEnabled !== false} />
                </div>
            </section>

            <p className="mt-10 text-xs text-subtle">
                <Link href="/terms" className="underline hover:text-foreground">
                    Terms of Service
                </Link>{" "}
                ·{" "}
                <Link href="/privacy" className="underline hover:text-foreground">
                    Privacy Policy
                </Link>
                . To delete your account or organization, email{" "}
                <a href="mailto:justinwclemson@gmail.com" className="underline hover:text-foreground">
                    justinwclemson@gmail.com
                </a>
                .
            </p>
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
