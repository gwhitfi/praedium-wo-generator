"use client";

import { useRef, useState } from "react";
import DeleteButton from "@/components/DeleteButton";
import { Button } from "@/components/Button";
import { noticeClass } from "@/lib/ui";
import { deleteMyAccount, deleteOrganization, previewAccountDeletion } from "./actions";

// Settings → Account → "Delete organization" (admins): typing its name confirms. Afterwards a full page load to
// /setup, so Clerk's session drops the organization.
export function DeleteOrganizationButton({ name }: { name: string }): React.ReactElement {
    return (
        <DeleteButton
            itemName={name}
            label="Delete organization"
            confirmWord={name}
            onDelete={async (confirmation) => {
                const result = await deleteOrganization(confirmation);
                // A full load, not router.push: Clerk's session must drop the deleted organization.
                // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                if (result.ok) window.location.assign("/setup");
                return result;
            }}
        >
            <p>
                Every property, contact, work order, photo, activity entry, email record and API key in{" "}
                <strong>{name}</strong> is deleted, for everyone in it. Contractor links stop working.
            </p>
            <p className="text-muted">Want a copy first? Use Export your data above.</p>
        </DeleteButton>
    );
}

type Preview = { blockedBy: string[]; organizationsToDelete: string[] };

// Settings → Account → "Delete my account": first asks the server what it would do, then either explains what
// blocks it (only admin of an organization with other members) or confirms, listing the organizations that go too.
export function DeleteMyAccountButton(): React.ReactElement {
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
                    // A full load, so the deleted user's session is gone everywhere on the page.
                    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                    if (result.ok) window.location.assign("/");
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
