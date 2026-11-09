import type { Metadata } from "next";
import Link from "next/link";
import TableOfContents from "@/components/TableOfContents";
import { headingId } from "@/lib/ui";

export const metadata: Metadata = { title: "Privacy Policy" };

const LINK = "underline hover:text-foreground";

const PROVIDERS: { name: string; role: string }[] = [
    { name: "Vercel", role: "Hosts the app, stores photos (private storage), keeps logs" },
    { name: "Neon", role: "The database" },
    { name: "Clerk", role: "Sign-in, accounts and organization membership" },
    { name: "Resend", role: "Sends email" },
    { name: "Anthropic", role: "Drafts work orders, only when you use Praedium Bot" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
    return (
        <section>
            <h2 id={headingId(title)} className="mt-10 scroll-mt-24 text-lg font-semibold">
                {title}
            </h2>
            {children}
        </section>
    );
}

function P({ children }: { children: React.ReactNode }): React.ReactElement {
    return <p className="mt-3 max-w-[68ch] text-[0.9375rem] leading-[1.65] text-secondary">{children}</p>;
}

function B({ children }: { children: React.ReactNode }): React.ReactElement {
    return <strong className="text-foreground">{children}</strong>;
}

function Email(): React.ReactElement {
    return (
        <a href="mailto:justinwclemson@gmail.com" className={LINK}>
            justinwclemson@gmail.com
        </a>
    );
}

export default function Privacy(): React.ReactElement {
    return (
        <main id="main" className="mx-auto max-w-3xl px-4 pt-10 pb-16 text-foreground">
            <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
            <p className="mt-1 text-sm text-subtle">Effective: November 4, 2026</p>
            <TableOfContents />

            <Section title="Who we are">
                <P>
                    Praedium is run by Justin Whitfield. You can reach us at <Email />. Our servers and service
                    providers are in the United States, so data you enter is stored and processed there.
                </P>
                <P>
                    This policy explains what we collect, why, and who sees it. It covers people who use Praedium
                    (property managers and their staff) and people whose details are entered into it (tenants,
                    contractors and other contacts).
                </P>
            </Section>

            <Section title="What we collect">
                <P>
                    <B>Account information.</B> When you sign in through Clerk we store your Clerk ID, email address,
                    first and last name, your role in the organization, your choice about the AI feature, and
                    timestamps. Clerk holds your password or sign-in method and your session; we never see your
                    password.
                </P>
                <P>
                    <B>Organization information.</B> The organization&apos;s name, phone and email, which also appear on
                    work orders and in emails.
                </P>
                <P>
                    <B>Records you enter.</B> Contacts (type, name, company, address, phone, email, notes), properties
                    and units (addresses, notes), and work orders (title, notes, due date, status, areas, line items and
                    their priority, one photo per line item, contractor notes, completion notes and a cancellation
                    reason). Each work order keeps a copy of the contractor&apos;s and tenant&apos;s name, phone and
                    email as they were when it was created, so later edits to a contact don&apos;t change past work
                    orders.
                </P>
                <P>
                    <B>Activity log.</B> Every action on a work order is recorded with the name of the person who did it
                    and the time: office actions by the signed-in user, contractor actions under the contractor&apos;s
                    name on the work order. Opening the contractor link is logged once per day.
                </P>
                <P>
                    <B>API keys.</B> The key&apos;s name, its first few characters, a hash of the key, who created it,
                    when it was last used, and its permissions. We never store the key itself.
                </P>
                <P>
                    <B>Technical information.</B> Our hosting provider keeps short-lived server logs, which may include
                    error messages, request paths and IP addresses. We don&apos;t use them to track or profile anyone.
                    Praedium has no advertising, analytics or tracking scripts.
                </P>
            </Section>

            <Section title="How we use it">
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-secondary">
                    <li>To sign you in and show you your organization&apos;s data.</li>
                    <li>
                        To create, send and track work orders, including emailing contractors and tenants when you ask
                        us to.
                    </li>
                    <li>To show contractors the work order you sent them and record what they do on it.</li>
                    <li>To let AI assistants you authorize work with your data.</li>
                    <li>To find and fix problems, keep the service secure, and respond to your requests.</li>
                    <li>To meet legal obligations.</li>
                </ul>
                <P>We don&apos;t sell personal information and we don&apos;t use it for advertising.</P>
            </Section>

            <Section title="AI processing">
                <P>
                    <B>Praedium Bot.</B> When you use it, we send your written description and today&apos;s date to
                    Anthropic&apos;s API, which returns a draft work order. Nothing else from your account is sent, but
                    anything you type in the description is. The instructions we give the model tell it to leave phone
                    numbers, emails, access codes and tenant names out of the draft, but that doesn&apos;t stop them
                    being sent if you include them, so don&apos;t. We don&apos;t log the description or the reply.
                    Anthropic&apos;s API terms state that API inputs and outputs are not used to train their models. You
                    can turn Praedium Bot off in Settings; it is then hidden and refused on the server.
                </P>
                <P>
                    <B>AI assistant access (MCP).</B> If an admin connects an outside AI assistant with an API key,
                    whatever that assistant reads goes to the company that runs it, under that company&apos;s terms and
                    privacy policy. You choose that company, not us.
                </P>
            </Section>

            <Section title="Who we share it with">
                <P>
                    <B>People in your organization</B> see all of its data.
                </P>
                <P>
                    <B>Contractors</B> who receive a work order link see the organization&apos;s contact details, the
                    property address and unit, the tenant&apos;s name, phone and email, the line items, notes and
                    photos. They also receive the work order and any cancellation by email.
                </P>
                <P>
                    <B>Tenants</B> receive an email naming the contractor and the property only when you tick
                    &quot;Notify tenant&quot; and the tenant has an email address.
                </P>
                <P>
                    <B>Service providers</B> that run parts of Praedium for us:
                </P>
                <table className="mt-3 w-full text-sm text-secondary">
                    <thead>
                        <tr className="border-b border-line text-left">
                            <th className="py-2 pr-4 font-medium text-foreground">Provider</th>
                            <th className="py-2 font-medium text-foreground">What it does for us</th>
                        </tr>
                    </thead>
                    <tbody>
                        {PROVIDERS.map((provider) => (
                            <tr key={provider.name} className="border-b border-line">
                                <td className="py-2 pr-4 align-top">{provider.name}</td>
                                <td className="py-2 align-top">{provider.role}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <P>
                    We may also disclose information if the law requires it or to deal with abuse or a security problem.
                </P>
            </Section>

            <Section title="Cookies and browser storage">
                <P>
                    Clerk sets cookies to keep you signed in. Blocking them means you can&apos;t sign in. Your
                    browser&apos;s local storage holds only your light/dark theme and color palette choice. There are no
                    advertising or analytics cookies.{" "}
                    <Link href="/demo" className={LINK}>
                        The demo
                    </Link>{" "}
                    keeps its sample data in your browser only. A contractor who verifies on a work order link gets a
                    cookie that remembers that browser for 30 days; it holds only a random key.
                </P>
            </Section>

            <Section title="If you're a tenant, contractor or other contact">
                <P>
                    Your details were entered by the property manager or company that uses Praedium to manage the
                    property you live in or work on. That company decides what to collect and is responsible for it; we
                    store and process it on their behalf. If you want your details corrected or removed, contact that
                    company first. If you can&apos;t reach them, email us at <Email /> and we&apos;ll help route your
                    request.
                </P>
                <P>
                    Contractors: when you open a work order link, check off items or add notes, those actions are
                    recorded under the contractor name on the work order.
                </P>
            </Section>

            <Section title="How long we keep it">
                <P>
                    We keep your organization&apos;s data for as long as the organization uses Praedium. Deleting a work
                    order, contact, property or unit in the app removes it immediately, along with any photos attached
                    to a deleted work order. Archiving is not deletion; archived records are still stored. Names copied
                    into the activity log stay in the log so the history still makes sense.
                </P>
                <P>
                    To delete your account, or your whole organization, email <Email /> and we&apos;ll do it within 30
                    days. Deleting your account removes your sign-in; your organization&apos;s records stay for its
                    other members, and your name stays in the activity log. Deleting an organization removes all of its
                    properties, contacts, work orders, photos, activity log and API keys for everyone, and can&apos;t be
                    undone. Copies already sent by email or read by an AI assistant you connected are outside our
                    control. Our hosting provider keeps server logs for a short time, typically no more than a few days.
                </P>
            </Section>

            <Section title="Security">
                <P>
                    Every database query is limited to your own organization. API keys are stored only as a hash. Photos
                    live in private storage and are only served to signed-in members of your organization or through an
                    active contractor link. Contractor links stop working when a work order is cancelled, archived or
                    deleted. No system is perfectly secure, so protect your login, your API keys and your contractor
                    links, and tell us at <Email /> if you think something has been exposed.
                </P>
            </Section>

            <Section title="Your choices and rights">
                <P>
                    You can view and edit your organization&apos;s data in the app, turn Praedium Bot off in Settings,
                    and (as an admin) revoke API keys. For a copy of your data, or to delete your account or
                    organization, email <Email />. We may ask you to confirm who you are. Depending on where you live,
                    you may have further rights under local privacy law, including the right to complain to a privacy
                    regulator.
                </P>
            </Section>

            <Section title="Children">
                <P>
                    Praedium is a business tool for people 18 and over. It isn&apos;t directed at children, and you
                    shouldn&apos;t enter children&apos;s personal details into it. Tell us if you believe that has
                    happened and we&apos;ll help remove them.
                </P>
            </Section>

            <Section title="Changes to this policy">
                <P>
                    We&apos;ll update this page when our practices change, and change the effective date at the top when
                    we do.
                </P>
            </Section>

            <Section title="Contact">
                <P>
                    Justin Whitfield, <Email />
                </P>
            </Section>
        </main>
    );
}
