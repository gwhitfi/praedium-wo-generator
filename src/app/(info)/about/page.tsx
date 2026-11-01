import type { Metadata } from "next";

export const metadata: Metadata = { title: "About · Praedium" };

export default function About(): React.ReactElement {
    return (
        <main className="mx-auto max-w-3xl px-4 py-10">
            <h1 className="text-2xl font-semibold">About</h1>
        </main>
    );
}
