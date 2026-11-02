import AiFeatureCard from "@/components/AiFeatureCard";
import { setAiPreference } from "./(app)/settings/actions";

// Shown on the dashboard until the user picks; either button saves the choice and the card goes away.
export default function AiPrompt(): React.ReactElement {
    return (
        <div className="mb-8">
            <AiFeatureCard
                title="Praedium can use AI to draft your work orders"
                note="This is the only place AI is used in this application. You can change your choice anytime in Settings."
                demoLabel="Watch a quick demo before deciding"
                actions={
                    <form action={setAiPreference} className="grid grid-cols-2 gap-2 sm:flex">
                        <button
                            type="submit"
                            name="aiEnabled"
                            value="on"
                            className="rounded-md bg-accent px-5 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover hover:cursor-pointer"
                        >
                            Use AI
                        </button>
                        <button
                            type="submit"
                            name="aiEnabled"
                            value="off"
                            className="rounded-md border border-line-strong bg-surface px-5 py-2 text-sm font-medium text-foreground hover:bg-surface-hover hover:cursor-pointer"
                        >
                            No AI
                        </button>
                    </form>
                }
            />
        </div>
    );
}
