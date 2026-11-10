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
import RecentEmails from "./RecentEmails";
import { DangerRow } from "@/components/DangerZone";
import { DeleteMyAccountButton, DeleteOrganizationButton } from "./DeleteAccountButtons";

export const metadata: Metadata = { title: "Settings" };

// How many emails Settings → Recent emails lists, and how long a key Praedium revoked stays listed.
const RECENT_EMAILS = 50;
const REVOKED_SHOWN_DAYS = 30;

// Keys Praedium revoked after this moment are still listed, with the reason.
function revokedShownSince(): Date {
    return new Date(Date.now() - REVOKED_SHOWN_DAYS * 24 * 60 * 60 * 1000);
}

// The page's sections, in order, for the jump links: the organization's settings, then your own. Recent emails is
// for admins only.
const SECTIONS = [
    { id: "organization", label: "Details", group: "Organization" },
    { id: "api-keys", label: "API keys", group: "Organization" },
    { id: "emails", label: "Recent emails", group: "Organization", adminOnly: true },
    { id: "export", label: "Export data", group: "Organization", adminOnly: true },
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
    // Active keys, plus those Praedium revoked lately (its creator left, say), so admins see why a key stopped.
    const apiKeys = await prisma.apiKey.findMany({
        where: {
            organizationId: organization.id,
            OR: [{ revokedAt: null }, { revokedReason: { not: null }, revokedAt: { gt: revokedShownSince() } }],
        },
        select: {
            id: true,
            name: true,
            prefix: true,
            createdAt: true,
            lastUsedAt: true,
            canChangeStatus: true,
            revokedAt: true,
            revokedReason: true,
        },
        orderBy: { createdAt: "desc" },
    });
    const emails = isAdmin
        ? await prisma.emailLog.findMany({
              where: { organizationId: organization.id },
              orderBy: { createdAt: "desc" },
              take: RECENT_EMAILS,
              select: {
                  id: true,
                  kind: true,
                  to: true,
                  subject: true,
                  status: true,
                  error: true,
                  createdAt: true,
                  workOrder: { select: { id: true, jobNumber: true } },
              },
          })
        : [];
    const sections = SECTIONS.filter((section) => isAdmin || !section.adminOnly);

    return (
        <main id="main" className={pageClass}>
            <PageHeader title="Settings" subtitle="Your organization's details and your own preferences." />

            <div className="lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-10">
                <SettingsNav sections={sections} />

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
                                                    <span
                                                        className={`truncate ${apiKey.revokedAt ? "text-muted" : ""}`}
                                                    >
                                                        {apiKey.name}
                                                    </span>
                                                    {apiKey.revokedAt && <Tag>Revoked</Tag>}
                                                    {apiKey.canChangeStatus && <Tag>Can change status</Tag>}
                                                </p>
                                                {apiKey.revokedAt && apiKey.revokedReason && (
                                                    <p className="mt-0.5 text-[0.8125rem] text-secondary">
                                                        Revoked {formatTimestamp(apiKey.revokedAt)}.{" "}
                                                        {apiKey.revokedReason}
                                                    </p>
                                                )}
                                                <p className="mt-0.5 text-[0.8125rem] text-muted">
                                                    <span className="font-mono">pr_{apiKey.prefix}…</span> · Created{" "}
                                                    {formatTimestamp(apiKey.createdAt)} ·{" "}
                                                    {apiKey.lastUsedAt
                                                        ? `Last used ${formatTimestamp(apiKey.lastUsedAt)}`
                                                        : "Never used"}
                                                </p>
                                            </div>
                                            {isAdmin && !apiKey.revokedAt && (
                                                <RevokeApiKeyButton id={apiKey.id} name={apiKey.name} />
                                            )}
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

                    {isAdmin && (
                        <section id="emails" aria-labelledby="emails-title" className="scroll-mt-24">
                            <GroupHeading
                                id="emails-title"
                                title="Recent emails"
                                description={`The last ${RECENT_EMAILS} emails Praedium sent for ${organization.name}, and whether they arrived. An address that bounces or marks an email as spam isn't emailed again.`}
                            />
                            <RecentEmails emails={emails} />
                        </section>
                    )}

                    {isAdmin && (
                        <section id="export" aria-labelledby="export-title" className="scroll-mt-24">
                            <GroupHeading
                                id="export-title"
                                title="Export your data"
                                description="Download everything in this organization as spreadsheets (CSV) and one JSON file, in a ZIP: properties, units, contacts, work orders, line items, activity and emails. Photos aren't included yet."
                            />
                            <div
                                className={`${cardClass} flex flex-wrap items-center justify-between gap-3 p-5 sm:px-6`}
                            >
                                <p className="text-sm text-muted">It includes tenant and contractor contact details.</p>
                                {/* A plain link: the browser downloads the file. */}
                                <a href="/settings/export" download className={buttonClass({ size: "sm" })}>
                                    Download ZIP
                                </a>
                            </div>
                        </section>
                    )}

                    {/* The second group: settings for you alone (the sections above are the organization's). */}
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
                            <DangerRow
                                title="Delete my account"
                                description="Removes your sign-in. Organizations you share stay for their other members; any you're the only member of are deleted too."
                            >
                                <DeleteMyAccountButton />
                            </DangerRow>
                            {isAdmin && (
                                <DangerRow
                                    title={`Delete ${organization.name}`}
                                    description="Removes the organization and all of its data for everyone in it, right away. This can't be undone."
                                >
                                    <DeleteOrganizationButton name={organization.name} />
                                </DangerRow>
                            )}
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
