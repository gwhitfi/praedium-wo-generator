import AiDemoVideo from "@/components/AiDemoVideo";
import { SparklesIcon } from "@/components/Icons";
import { buttonClass, cardClass } from "@/lib/ui";
import { setAiPreference } from "./(app)/settings/actions";

// A slim banner on the dashboard until the user picks; either button saves the choice and it goes away.
export default function AiPrompt(): React.ReactElement {
    return (
        <section
            aria-labelledby="ai-prompt-title"
            className={`${cardClass} mt-10 flex flex-col gap-4 border-accent/30 p-4 sm:flex-row sm:items-center sm:p-5`}
        >
            <div className="flex min-w-0 flex-1 gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
                    <SparklesIcon size={18} />
                </span>
                <div className="min-w-0">
                    <h2 id="ai-prompt-title" className="text-sm font-semibold text-foreground">
                        Draft work orders from a sentence
                    </h2>
                    <p className="mt-0.5 text-sm text-muted">
                        Praedium Bot turns &ldquo;Unit 4B, kitchen sink leaking, Joe&apos;s Plumbing by Friday&rdquo;
                        into a draft for you to review. It&apos;s the only place AI is used, and you can change this in
                        Settings.
                    </p>
                    <div className="mt-1.5">
                        <AiDemoVideo label="Watch a short demo" />
                    </div>
                </div>
            </div>
            <form action={setAiPreference} className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
                <button type="submit" name="aiEnabled" value="off" className={buttonClass({ variant: "ghost" })}>
                    No thanks
                </button>
                <button type="submit" name="aiEnabled" value="on" className={buttonClass({ variant: "primary" })}>
                    Turn it on
                </button>
            </form>
        </section>
    );
}
