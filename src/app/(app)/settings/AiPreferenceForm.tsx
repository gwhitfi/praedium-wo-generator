import AiDemoVideo from "@/components/AiDemoVideo";
import { ShieldIcon, SparklesIcon } from "@/components/Icons";
import { cardClass } from "@/lib/ui";
import { setAiPreference } from "./actions";

// Praedium Bot on or off for this user. The switch submits the opposite of the current value.
export default function AiPreferenceForm({ aiEnabled }: { aiEnabled: boolean }): React.ReactElement {
    return (
        <section aria-labelledby="ai-settings-title" className={`${cardClass} overflow-hidden`}>
            <div className="p-5 sm:p-6">
                <h3 id="ai-settings-title" className="flex items-center gap-2 text-base font-semibold text-foreground">
                    <SparklesIcon size={16} className="text-accent" />
                    Praedium Bot
                </h3>
                <p className="mt-1 text-sm text-muted">
                    Turns a plain description like &ldquo;Unit 4B, kitchen sink leaking, Joe&apos;s Plumbing by
                    Friday&rdquo; into a draft work order for you to review.
                </p>
                <p className="mt-2 flex items-start gap-2 text-sm text-muted">
                    <ShieldIcon size={15} className="mt-0.5 shrink-0" />
                    This is the only place AI is used in Praedium.
                </p>
                <div className="mt-3">
                    <AiDemoVideo label="Watch a short demo" />
                </div>
            </div>
            <form action={setAiPreference} className="border-t border-line bg-background/40 px-5 py-3 sm:px-6">
                <input type="hidden" name="aiEnabled" value={aiEnabled ? "off" : "on"} />
                <button
                    type="submit"
                    role="switch"
                    aria-checked={aiEnabled}
                    aria-describedby="ai-switch-hint"
                    className="flex w-full items-center gap-3 text-left text-sm hover:cursor-pointer"
                >
                    <span className="flex-1">
                        <span className="block font-medium text-foreground">
                            Praedium Bot is {aiEnabled ? "on" : "off"}
                        </span>
                        <span id="ai-switch-hint" className="block text-[0.8125rem] text-muted">
                            {aiEnabled
                                ? "Applies right away. Turn it off to hide the bot and the Draft with AI button."
                                : "Turn it on to draft work orders from a description."}
                        </span>
                    </span>
                    <span
                        aria-hidden
                        className={`flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors ${aiEnabled ? "bg-accent" : "bg-line-strong"}`}
                    >
                        <span
                            className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${aiEnabled ? "translate-x-5" : ""}`}
                        />
                    </span>
                </button>
            </form>
        </section>
    );
}
