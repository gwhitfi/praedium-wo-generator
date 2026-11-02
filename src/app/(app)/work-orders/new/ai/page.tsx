import Link from "next/link";
import BotForm from "./BotForm";

export default function NewWorkOrderWithAi() {
    return (
        <main className="mx-auto max-w-3xl px-4 py-10 text-foreground">
            <h1 className="mb-2 text-2xl font-semibold">Describe your work order</h1>
            <p className="mb-6 text-sm text-muted">
                Be sure you include the property address and a contractor&apos;s name. Do not include any phone numbers
                or tenant information. Photos will need to be added manually in a later step.
            </p>
            <BotForm />
            <Link href="/work-orders" className="mt-6 inline-block text-sm text-muted hover:text-foreground">
                Cancel
            </Link>
        </main>
    );
}
