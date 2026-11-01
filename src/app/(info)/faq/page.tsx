import type { Metadata } from "next";

export const metadata: Metadata = { title: "FAQ · Praedium" };

export default function Faq(): React.ReactElement {
    return (
        <main className="mx-auto max-w-3xl px-4 py-10">
            <h1 className="text-2xl font-semibold">FAQ</h1>
        </main>
    );
}
