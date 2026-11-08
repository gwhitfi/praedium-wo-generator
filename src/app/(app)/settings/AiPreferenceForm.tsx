import AiFeatureCard, { SparklesIcon } from "@/components/AiFeatureCard";
import { setAiPreference } from "./actions";

// "Turn off Praedium Bot" switch: on means Praedium Bot is hidden for this user. Each click submits the opposite value.
export default function AiPreferenceForm({ aiEnabled }: { aiEnabled: boolean }): React.ReactElement {
    const noAi = !aiEnabled;

    return (
        <AiFeatureCard
            title="Praedium Bot"
            titleAs="h3"
            note="This is the only place AI is used in this application."
            demoLabel="Watch a quick demo"
            actions={
                <form action={setAiPreference}>
                    <input type="hidden" name="aiEnabled" value={noAi ? "on" : "off"} />
                    <button
                        type="submit"
                        role="switch"
                        aria-checked={noAi}
                        className="flex w-full items-center gap-3 rounded-md border border-line-strong bg-surface px-3 py-2 text-left text-sm hover:bg-surface-hover hover:cursor-pointer sm:w-auto"
                    >
                        <span className="flex-1">
                            <span className="block font-medium text-foreground">Turn off Praedium Bot</span>
                            <span className="block text-xs text-subtle">
                                Hide Praedium Bot and the{" "}
                                <span className="inline-block align-[-2px] text-accent">
                                    <SparklesIcon size={12} />
                                </span>{" "}
                                button.
                            </span>
                        </span>
                        <span
                            aria-hidden
                            className={`flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${noAi ? "bg-accent" : "bg-line-strong"}`}
                        >
                            <span
                                className={`h-4 w-4 rounded-full transition-transform ${noAi ? "translate-x-4 bg-surface" : "bg-foreground"}`}
                            />
                        </span>
                    </button>
                </form>
            }
        />
    );
}
