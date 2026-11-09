import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { formatPhone } from "@/lib/phone";
import { formatTimestamp } from "@/lib/dates";
import prisma from "@/lib/prisma";
import PageHeader from "@/components/list/PageHeader";
import { Tag } from "@/components/StatusBadge";
import { buttonClass, cardClass, pageClass, textLinkClass } from "@/lib/ui";
import OrganizationContactForm from "./OrganizationContactForm";
import AiPreferenceForm from "./AiPreferenceForm";
import AppearanceSettings from "./AppearanceSettings";
import NotificationSettings from "./NotificationSettings";
import { resolveNotificationTypes } from "@/lib/notificationTypes";
import ApiKeyForm from "./ApiKeyForm";
import RevokeApiKeyButton from "./RevokeApiKeyButton";
import SettingsNav from "./SettingsNav";

export const metadata: Metadata = { title: "Settings" };

// The page's sections, in order, for the jump links: the organization's settings, then your own.
const SECTIONS = [
    { id: "organization", label: "Details", group: "Organization" },
    { id: "api-keys", label: "API keys", group: "Organization" },
    { id: "appearance", label: "Appearance", group: "You" },
    { id: "notifications", label: "Notifications", group: "You" },
    { id: "praedium-bot", label: "Praedium Bot", group: "You" },
    { id: "account", label: "Account", group: "You" },
];

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
        <main id="main" className={pageClass}>
            <PageHeader title="Settings" subtitle="Your organization's details and your own preferences." />

            <div className="lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-10">
                <SettingsNav sections={SECTIONS} />

                <div className="flex min-w-0 max-w-2xl flex-col gap-10">
                    <section id="organization" aria-labelledby="organization-title" className="scroll-mt-24">
                        <GroupHeading
                            id="organization-title"
                            title="Organization"
                            description={`Shared by everyone in ${organization.name}.`}
                        />
                        {isAdmin ? (
                            <OrganizationContactForm
                                name={organization.name}
                                phone={organization.phone ? formatPhone(organization.phone) : null}
                                email={organization.email}
                            />
                        ) : (
                            <div className={`${cardClass} p-5 text-sm sm:p-6`}>
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

                    <section id="api-keys" aria-labelledby="api-keys-title" className="scroll-mt-24">
                        <GroupHeading
                            id="api-keys-title"
                            title="API keys"
                            description="Let an AI assistant read and change this organization's properties, contacts and work orders, and create drafts. Keys marked “Can change status” can also send, cancel, archive and restore work orders. Everything a key does is credited to the person who created it."
                        />
                        <div className={`${cardClass} overflow-hidden`}>
                            {apiKeys.length === 0 ? (
                                <p className="p-5 text-sm text-muted sm:px-6">No API keys yet.</p>
                            ) : (
                                <ul className="divide-y divide-line">
                                    {apiKeys.map((apiKey) => (
                                        <li key={apiKey.id} className="flex items-center gap-3 px-5 py-3.5 sm:px-6">
                                            <div className="min-w-0 flex-1">
                                                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                                                    <span className="truncate">{apiKey.name}</span>
                                                    {apiKey.canChangeStatus && <Tag>Can change status</Tag>}
                                                </p>
                                                <p className="mt-0.5 text-[0.8125rem] text-muted">
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

                    {/* The second group: settings for you alone (the first two sections are the organization's). */}
                    <section aria-labelledby="preferences-title" className="flex flex-col gap-6 border-t border-line pt-10">
                        <GroupHeading
                            id="preferences-title"
                            title="You"
                            description="Only you see these. They don't change anything for others in your organization."
                        />
                        <div id="appearance" className="scroll-mt-24">
                            <AppearanceSettings />
                        </div>
                        <NotificationSettings selected={resolveNotificationTypes(user.notificationTypes)} />
                        <div id="praedium-bot" className="scroll-mt-24">
                            <AiPreferenceForm aiEnabled={user.aiEnabled === true} />
                        </div>
                    </section>

                    <section id="account" aria-labelledby="account-title" className="scroll-mt-24">
                        <GroupHeading
                            id="account-title"
                            title="Account"
                            description="Your profile and sign-in are managed from the account menu: your initials, top right."
                        />
                        <div className={`${cardClass} divide-y divide-line`}>
                            <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                                <div>
                                    <h3 className="text-sm font-semibold text-foreground">
                                        Delete your account or organization
                                    </h3>
                                    <p className="mt-0.5 text-sm text-muted">
                                        Email us to have it removed, along with its data.
                                    </p>
                                </div>
                                <a
                                    href="mailto:justinwclemson@gmail.com?subject=Delete%20my%20Praedium%20account"
                                    className={buttonClass({ size: "sm" })}
                                >
                                    Request deletion
                                </a>
                            </div>
                            <p className="px-5 py-3.5 text-sm text-muted sm:px-6">
                                Read the{" "}
                                <Link href="/terms" className={textLinkClass}>
                                    Terms of Service
                                </Link>{" "}
                                and the{" "}
                                <Link href="/privacy" className={textLinkClass}>
                                    Privacy Policy
                                </Link>
                                .
                            </p>
                        </div>
                    </section>
                </div>
            </div>
        </main>
    );
}

function GroupHeading({ id, title, description }: { id: string; title: string; description: string }) {
    return (
        <div className="mb-3">
            <h2 id={id} className="text-lg font-semibold text-foreground">
                {title}
            </h2>
            <p className="mt-1 text-sm text-muted">{description}</p>
        </div>
    );
}
