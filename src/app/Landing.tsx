import Link from "next/link";
import Logo from "@/components/Logo";
import PublicHeader from "@/components/PublicHeader";
import HowItWorks from "@/components/HowItWorks";

const FEATURES = [
    {
        title: "Keep track of your properties and contractors",
        body: "Add all your properties and contractors, and manage them on their own pages.",
    },
    {
        title: "Work orders update live",
        body: "When a contractor marks a line item as complete, it will show up on the office's work order view, allowing you to track the progress in real time.",
    },
    {
        title: "Receive notifications",
        body: "Contractor receives an email when they are assigned a new work order, and the office receives an email when the contractor completes the work order.",
    },
];

export default function Landing() {
    return (
        <div className="text-foreground">
            <PublicHeader />

            <main>
                {/* Hero */}
                <section className="mx-auto max-w-3xl px-4 pt-24 text-center">
                    <h1>
                        <Logo className="mx-auto h-12 w-auto sm:h-16" />
                    </h1>
                    <p className="mt-6 text-lg font-medium sm:text-xl">Work orders for every property you manage.</p>
                    <p className="mx-auto mt-6 max-w-xl text-lg text-muted">
                        Build a work order room by room, send your contractor a link, and watch items get checked off as
                        the work gets done. Nothing for them to install.
                    </p>
                    <div className="mt-10">
                        <h2 className="text-lg font-medium">Give it a shot</h2>
                        <Link
                            href="/demo"
                            className="mt-4 inline-block rounded-md bg-status-closed px-6 py-3 text-sm font-medium text-on-accent hover:brightness-90"
                        >
                            Demo
                        </Link>
                    </div>
                </section>
                <div className="mx-auto max-w-5xl px-4 pb-20">
                    <HowItWorks />
                </div>

                {/* Features */}
                <section className="mx-auto max-w-5xl border-t border-line px-4 py-20">
                    <h2 className="text-center text-2xl font-semibold">Make tracking work orders easy</h2>
                    <div className="mt-12 grid gap-10 sm:grid-cols-3">
                        {FEATURES.map((feature) => (
                            <div key={feature.title}>
                                <h3 className="text-base font-medium">{feature.title}</h3>
                                <p className="mt-2 text-sm leading-relaxed text-muted">{feature.body}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Closing call to action */}
                <section className="mx-auto max-w-3xl border-t border-line px-4 py-20 text-center">
                    <h2 className="text-2xl font-semibold">Try sending your first work order now!</h2>
                    <Link
                        href="/sign-up"
                        className="mt-8 inline-block rounded-md bg-accent px-6 py-3 text-sm font-medium text-on-accent hover:bg-accent-hover"
                    >
                        Get started
                    </Link>
                </section>
            </main>

            <footer className="mx-auto max-w-5xl border-t border-line px-4 py-8 text-sm text-subtle">
                <p>&copy; {new Date().getFullYear()} Praedium</p>
            </footer>
        </div>
    );
}
