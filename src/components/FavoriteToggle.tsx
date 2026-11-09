"use client";

import { useState } from "react";

// The star beside a contact's or property's name. Favorites are listed first.
export default function FavoriteToggle({ favorite, onToggle }: { favorite: boolean; onToggle: () => Promise<void> }) {
    const [pending, setPending] = useState(false);

    async function handleClick() {
        setPending(true);
        try {
            await onToggle();
        } finally {
            setPending(false);
        }
    }

    return (
        <button
            type="button"
            onClick={handleClick}
            disabled={pending}
            aria-pressed={favorite}
            aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
            title={favorite ? "Favorite: listed first. Click to remove." : "Add to favorites to list it first"}
            className={`ml-1 inline-flex h-9 w-9 items-center justify-center rounded-md align-middle text-xl leading-none hover:cursor-pointer hover:bg-surface-hover disabled:opacity-40 ${
                favorite ? "text-foreground" : "text-subtle hover:text-foreground"
            }`}
        >
            <span aria-hidden>{favorite ? "★" : "☆"}</span>
        </button>
    );
}
