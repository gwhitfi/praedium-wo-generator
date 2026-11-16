import Link from "next/link";
import PublicHeader from "@/components/PublicHeader";
import PublicFooter from "@/components/PublicFooter";
import HowItWorks from "@/components/HowItWorks";
import HeroPreview from "@/components/HeroPreview";
import ProductShowcase from "@/components/ProductShowcase";
import { CheckIcon, PhoneIcon } from "@/components/Icons";
import { buttonClass } from "@/lib/ui";

// "Who it's for": the three kinds of people the product is built around, each with what it does for them.
const AUDIENCE = [
    {
        title: "Independent landlords",
        body: "No matter the size of your portfolio, send repair requests to your trusted contractors with confidence.",
    },
    {
        title: "Property managers",
        body: "One shared list of every open job across the properties you manage: who it's assigned to, what's finished, and what's past due.",
    },
    {
        title: "Turnover coordinators",
        body: "Write up a detailed turnover work order, attach pictures, and hand off to a contractor or your own crew.",
    },
];

const HIGHLIGHTS = ["No app required", "Works in your phone's browser", "Print-ready work orders"];

export default function Landing() {
    return (
        <div className="text-foreground">
            <PublicHeader />

            <main id="main">
                <section className="mx-auto grid max-w-5xl items-center gap-14 px-4 pt-10 pb-16 sm:pt-14 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-16 lg:pt-12">
                    <div>
                        <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-muted">
                            <PhoneIcon size={13} className="text-accent-ink" />
                            For landlords and small property managers
                        </p>
                        <h1 className="mt-5 text-4xl font-semibold tracking-tight text-balance sm:text-5xl sm:leading-[1.1]">
                            Work orders your contractors can check off from their phone.
                        </h1>
                        <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
                            Easily build a work order room by room, send your contractor a link, and follow the progress
                            as the work gets done. Your contractors will have an intuitive interface to use, and
                            there&apos;s no app required for them to get started.
                        </p>
                        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                            <Link href="/sign-up" className={buttonClass({ variant: "primary", size: "lg" })}>
                                Get started
                            </Link>
                            <Link href="/demo" className={buttonClass({ size: "lg" })}>
                                Try the demo
                            </Link>
                        </div>
                        <p className="mt-3 text-sm font-medium text-secondary">Free while in early access.</p>
                        <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
                            {HIGHLIGHTS.map((highlight) => (
                                <li key={highlight} className="flex items-center gap-1.5">
                                    <CheckIcon size={14} className="text-accent-ink" />
                                    {highlight}
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div className="pb-16">
                        <HeroPreview />
                    </div>
                </section>

                <div className="border-t border-line bg-surface/40">
                    <HowItWorks />
                </div>

                <ProductShowcase />

                <section aria-labelledby="audience-title" className="border-t border-line bg-surface/40">
                    <div className="mx-auto max-w-5xl px-4 py-16 sm:py-20">
                        <p className="text-sm font-semibold text-accent-ink">Who it&apos;s for</p>
                        <h2 id="audience-title" className="mt-2 max-w-xl text-2xl font-semibold tracking-tight sm:text-3xl">
                            Landlords and property managers
                        </h2>
                        <div className="mt-8 grid gap-8 sm:grid-cols-3">
                            {AUDIENCE.map((group) => (
                                <div key={group.title} className="border-l-2 border-accent/40 pl-4">
                                    <h3 className="font-semibold">{group.title}</h3>
                                    <p className="mt-1.5 text-sm leading-relaxed text-muted">{group.body}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <section aria-labelledby="cta-title" className="border-t border-line">
                    <div className="mx-auto max-w-5xl px-4 py-20 sm:py-24">
                        <div className="rounded-2xl border border-accent/30 bg-accent/[0.06] px-6 py-12 text-center sm:px-12">
                            <h2 id="cta-title" className="text-3xl font-semibold tracking-tight text-balance">
                                Send your first work order now
                            </h2>
                            <p className="mx-auto mt-3 max-w-md text-muted">
                                Add a property and a contractor, list the work, and send them a link. Free while in
                                early access.
                            </p>
                            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                                <Link href="/sign-up" className={buttonClass({ variant: "primary", size: "lg" })}>
                                    Get started
                                </Link>
                                <Link href="/demo" className={buttonClass({ size: "lg" })}>
                                    Try the demo first
                                </Link>
                            </div>
                        </div>
                    </div>
                </section>
            </main>

            <PublicFooter />
        </div>
    );
}
