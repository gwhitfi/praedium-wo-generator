import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Terms of Service · Praedium" };

const LINK = "underline hover:text-foreground";

function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
    return (
        <section>
            <h2 className="mt-8 text-base font-medium">{title}</h2>
            {children}
        </section>
    );
}

function P({ children }: { children: React.ReactNode }): React.ReactElement {
    return <p className="mt-2 text-sm leading-relaxed text-secondary">{children}</p>;
}

function Email(): React.ReactElement {
    return (
        <a href="mailto:justinwclemson@gmail.com" className={LINK}>
            justinwclemson@gmail.com
        </a>
    );
}

function PrivacyLink(): React.ReactElement {
    return (
        <Link href="/privacy" className={LINK}>
            Privacy Policy
        </Link>
    );
}

export default function Terms(): React.ReactElement {
    return (
        <main className="mx-auto max-w-3xl px-4 py-10 text-foreground">
            <h1 className="text-2xl font-semibold">Terms of Service</h1>
            <p className="mt-1 text-sm text-subtle">Effective: November 4, 2026</p>

            <Section title="1. Agreement">
                <P>
                    These terms are an agreement between you and Justin Whitfield (&quot;we&quot;, &quot;us&quot;) about
                    your use of Praedium. By creating an account or using the service, you accept them. If you use
                    Praedium for a company or organization, you confirm you are allowed to accept these terms on its
                    behalf. You must be at least 18 years old.
                </P>
            </Section>

            <Section title="2. What Praedium is">
                <P>
                    Praedium is a tool for property managers to create, manage and send maintenance work orders to
                    contractors. It is currently free, and it is offered to users in the United States. It does not
                    perform repairs, choose contractors, or guarantee that any work gets done. It is not an emergency
                    service. You are responsible for your maintenance decisions and for what you send to contractors and
                    tenants.
                </P>
                <P>
                    <Link href="/demo" className={LINK}>
                        The demo
                    </Link>{" "}
                    runs entirely in your browser with sample data. Nothing you do there is saved or sent anywhere.
                </P>
            </Section>

            <Section title="3. Accounts and organizations">
                <P>
                    Sign-in and organization membership are handled by Clerk, our authentication provider. Keep your
                    login secure and tell us if you suspect someone else has used it.
                </P>
                <P>
                    A user can belong to more than one organization; each organization&apos;s data is separate, and
                    everyone in an organization can see and change all of its data. Admins control who is a member,
                    change the organization&apos;s name and contact details, and can create and revoke API keys. Only
                    invite people who should have access to your organization&apos;s properties, contacts and work
                    orders.
                </P>
            </Section>

            <Section title="4. Your data, and information about other people">
                <P>
                    You own the content you enter. You give us permission to store, process, display and send it as
                    needed to run Praedium, including through the service providers listed in the <PrivacyLink />.
                </P>
                <P>
                    Most of what you enter is about other people: tenants, contractors and other contacts. You are
                    responsible for having the right to collect and use that information, for keeping it accurate, and
                    for any notices the people in it are owed. Enter only what a contractor needs to do the job.
                    Don&apos;t put door codes, lockbox codes, alarm codes or other sensitive details in work orders or
                    photos.
                </P>
            </Section>

            <Section title="5. Contractor links">
                <P>
                    Contractors don&apos;t need an account. When you send a work order, the contractor gets a link
                    containing a long random code. Anyone who has that link can open the work order and see your
                    organization&apos;s name and contact details, the property address and unit, and the list of work
                    items. To see the tenant&apos;s name, phone and email, the notes and photos, to check off items, add
                    notes and mark the work order complete, or to list the contractor&apos;s other current work orders,
                    the contractor verifies once by entering a code we email to the contractor&apos;s address on file.
                    The browser stays verified for 30 days from its last visit, and you can sign a contractor out of
                    every device from their contact page.
                </P>
                <P>
                    Send links only to the contractor, and treat them like a password. The page is hidden from search
                    engines, but that doesn&apos;t stop someone forwarding the link. A link stops working when the work
                    order is cancelled, archived or deleted, and changing the contractor issues a new link. Information
                    that has already been viewed, downloaded or emailed can&apos;t be recalled.
                </P>
            </Section>

            <Section title="6. AI features">
                <P>
                    <strong className="text-foreground">Praedium Bot</strong> turns a written description into a draft
                    work order using Claude, an AI model from Anthropic. Only your description and today&apos;s date are
                    sent. The draft can be wrong, incomplete or misread what you said. Review it before you send it to
                    anyone. Each user can turn Praedium Bot off in Settings.
                </P>
                <P>
                    <strong className="text-foreground">AI assistant access (MCP).</strong> An admin can create an API
                    key and give it to an outside AI assistant such as Claude or ChatGPT. With the key, that assistant
                    can read and change your organization&apos;s properties, contacts and work orders and create draft
                    work orders. Keys marked &quot;Can change status&quot; can also send, cancel, archive and restore
                    work orders. Everything the assistant does is recorded as done by the person who created the key.
                    You choose the assistant and the company behind it, and you are responsible for what it does with
                    your key and your data. Keep keys private and revoke any key you no longer need.
                </P>
            </Section>

            <Section title="7. Email">
                <P>
                    Praedium sends email on your behalf through Resend: work orders and cancellations to contractors,
                    and, if you tick &quot;Notify tenant&quot;, a short notice to the tenant naming the contractor and
                    the property. These emails show your organization&apos;s name as the sender and use your
                    organization&apos;s email as the reply-to address. Keep those details accurate, and only send to
                    people who expect to hear from you about maintenance. We can&apos;t guarantee that every email is
                    delivered. Marking a work order as sent by SMS does not send a text message; Praedium has no SMS
                    feature.
                </P>
            </Section>

            <Section title="8. Acceptable use">
                <P>
                    Don&apos;t use Praedium to break the law, to harass or deceive anyone, or to send spam. Don&apos;t
                    upload content you have no right to share. Don&apos;t try to reach another organization&apos;s data,
                    get around access controls, or interfere with the service. Don&apos;t impersonate another person or
                    business.
                </P>
            </Section>

            <Section title="9. Availability and changes">
                <P>
                    We may add, change or remove features, and we may suspend or shut down the service. We don&apos;t
                    promise it will always be available or error-free. Keep your own copies of anything important. If we
                    shut the service down, we will try to give reasonable notice so you can export your data first.
                </P>
            </Section>

            <Section title="10. Ending the agreement">
                <P>
                    You can stop using Praedium at any time and ask us to delete your account or your organization. We
                    may suspend or close accounts that break these terms, create a security risk, or where the law
                    requires it. Where it&apos;s reasonable, we&apos;ll tell you why and give you a chance to fix the
                    problem. The <PrivacyLink /> explains what happens to your data afterwards.
                </P>
            </Section>

            <Section title="11. No warranty">
                <P>
                    Praedium is provided &quot;as is&quot; and &quot;as available&quot;, without any warranty, express
                    or implied, including warranties of merchantability, fitness for a particular purpose and
                    non-infringement. We don&apos;t guarantee the accuracy of AI output, the delivery of email, or the
                    work of any contractor. Some places don&apos;t allow these exclusions, so some may not apply to you.
                </P>
            </Section>

            <Section title="12. Limitation of liability">
                <P>
                    To the extent the law allows, we are not liable for indirect, incidental or consequential damages,
                    lost profits, or lost data arising from your use of Praedium. Our total liability for any claim
                    connected to the service is limited to the greater of $100 or the amount you paid us in the past 12
                    months. These limits don&apos;t apply to anything the law doesn&apos;t allow us to limit.
                </P>
            </Section>

            <Section title="13. Your responsibility for claims">
                <P>
                    If someone brings a claim against us because of content you entered, messages you sent, or your
                    breach of these terms, you agree to cover our reasonable costs and any damages. This doesn&apos;t
                    apply to claims caused by our own wrongdoing.
                </P>
            </Section>

            <Section title="14. Governing law">
                <P>
                    These terms are governed by the laws of the State of South Carolina, and any dispute will be heard
                    in the state or federal courts located in Anderson County, South Carolina, unless the law where you
                    live gives you rights that override this.
                </P>
            </Section>

            <Section title="15. Changes to these terms">
                <P>
                    We may update these terms. When we do, we&apos;ll change the effective date at the top of this page.
                    If you keep using Praedium after a change takes effect, you accept the new terms. If you don&apos;t
                    agree, stop using the service and ask us to delete your account.
                </P>
            </Section>

            <Section title="16. Contact">
                <P>
                    Justin Whitfield, <Email />
                </P>
            </Section>
        </main>
    );
}
