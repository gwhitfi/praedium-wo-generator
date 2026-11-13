"use client";

import { useRef, useState } from "react";
import { useClerk } from "@clerk/nextjs";
import DeleteButton from "@/components/DeleteButton";
import { Button } from "@/components/Button";
import { noticeClass } from "@/lib/ui";
import { deleteMyAccount, deleteOrganization, previewAccountDeletion } from "./actions";

// A full page load, not router.push, so every part of the page starts from the new session.
function reloadAt(path: string): void {
    window.location.assign(path);
}

// Settings → Account → "Delete organization" (admins): typing its name confirms. It's locked at once and deleted 7
// days later unless an admin restores it from /setup. Afterwards the session's active organization is cleared before
// going to /setup (where the restore button is): the browser's session token still names the locked organization for
// up to a minute, and pages would otherwise look it up.
export function DeleteOrganizationButton({ name }: { name: string }): React.ReactElement {
    const clerk = useClerk();
    return (
        <DeleteButton
            itemName={name}
            label="Delete organization"
            title={<>Delete &ldquo;{name}&rdquo;?</>}
            warning="It's locked for everyone right away."
            confirmLabel="Delete organization"
            confirmWord={name}
            onDelete={async (confirmation) => {
                const result = await deleteOrganization(confirmation);
                if (result.ok) {
                    try {
                        await clerk.setActive({ organization: null });
                    } catch (error) {
                        console.error("Couldn't clear the active organization", error);
                    }
                    reloadAt("/setup");
                }
                return result;
            }}
        >
            <p>
                <strong>{name}</strong> is locked for everyone right away and deleted 7 days later: every property,
                contact, work order, photo, activity entry, email record and API key in it. Until then, any admin can
                restore it. API keys and contractor links stop working while it&apos;s locked.
            </p>
            <p className="text-muted">Want a copy first? Use Export your data above.</p>
        </DeleteButton>
    );
}

type Preview = { blockedBy: string[]; organizationsToDelete: string[] };

// Settings → Account → "Delete my account": first asks the server what it would do, then either explains what
// blocks it (only admin of an organization with other members) or confirms, listing the organizations that go too.
export function DeleteMyAccountButton(): React.ReactElement {
    const clerk = useClerk();
    const openRef = useRef<(() => void) | null>(null);
    const [preview, setPreview] = useState<Preview | null>(null);
    const [checking, setChecking] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function start() {
        setChecking(true);
        setError(null);
        try {
            const result = await previewAccountDeletion();
            if (!result.ok) {
                setError(result.error);
                return;
            }
            setPreview(result);
            if (result.blockedBy.length === 0) openRef.current?.();
        } catch {
            setError("Couldn't check your organizations. Try again.");
        } finally {
            setChecking(false);
        }
    }

    const blocked = preview && preview.blockedBy.length > 0;
    return (
        <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end">
            <Button size="sm" variant="danger-outline" onClick={start} pending={checking} pendingLabel="Checking…">
                Delete my account
            </Button>
            {error && (
                <p role="alert" className="text-sm text-danger">
                    {error}
                </p>
            )}
            {blocked && (
                <p role="alert" className={`${noticeClass.warning} sm:max-w-xs`}>
                    You&apos;re the only admin of {preview.blockedBy.join(", ")}. Make someone else an admin there first
                    (Manage organization in the menu), then delete your account.
                </p>
            )}
            <DeleteButton
                itemName="your account"
                hideTrigger
                openRef={openRef}
                onDelete={async (confirmation) => {
                    const result = await deleteMyAccount(confirmation);
                    if (result.ok) {
                        // The browser still holds the deleted user's session token for up to a minute: sign out so
                        // the landing page doesn't treat them as signed in. Clerk may already have ended the
                        // session, so a failure here doesn't matter.
                        try {
                            await clerk.signOut();
                        } catch (error) {
                            console.error("Sign-out after account deletion failed", error);
                        }
                        reloadAt("/");
                    }
                    return result;
                }}
            >
                <p>
                    Your sign-in is removed and you&apos;re signed out. Your name stays on what you did in the activity
                    log.
                </p>
                {preview && preview.organizationsToDelete.length > 0 ? (
                    <p className={noticeClass.danger}>
                        You&apos;re the only member of <strong>{preview.organizationsToDelete.join(", ")}</strong>, so{" "}
                        {preview.organizationsToDelete.length === 1 ? "it is" : "they are"} deleted too, with all of
                        {preview.organizationsToDelete.length === 1 ? " its" : " their"} data.
                    </p>
                ) : (
                    <p className="text-muted">Your organizations and their data stay for the other members.</p>
                )}
            </DeleteButton>
        </div>
    );
}
