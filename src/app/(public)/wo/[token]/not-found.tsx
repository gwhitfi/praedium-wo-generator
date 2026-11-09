import { LinkIcon } from "@/components/Icons";

export default function WorkOrderNotFound() {
    return (
        <main id="main" className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center text-foreground">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-hover text-muted">
                <LinkIcon size={22} />
            </div>
            <h1 className="mt-6 text-2xl font-semibold tracking-tight">This link isn&apos;t available</h1>
            <p className="mt-3 text-muted">
                The work order may have been cancelled, replaced with a new link, or not sent yet.
            </p>
            <p className="mt-3 text-muted">Contact the office that sent it to you for the current link.</p>
        </main>
    );
}
