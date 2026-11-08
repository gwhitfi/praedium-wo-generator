"use client";

import { useEffect } from "react";
import { NOTIFICATIONS_SEEN_EVENT } from "@/lib/notificationTypes";
import { markInboxSeen } from "./actions";

// Marks the user's notifications seen once the inbox is on screen, then tells the bell to clear its badge.
// Renders nothing.
export default function MarkSeen(): null {
    useEffect(() => {
        markInboxSeen()
            .then(() => window.dispatchEvent(new Event(NOTIFICATIONS_SEEN_EVENT)))
            .catch((error: unknown) => console.error("markInboxSeen failed", error));
    }, []);
    return null;
}
