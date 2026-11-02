"use client";

import { useEffect } from "react";
import { recordOpen } from "./actions";

const VISIBLE_FOR_MS = 2000;

// Records the contractor's visit once the tab has been visible for 2 seconds. Link scanners and chat previews
// usually don't run scripts or close the page sooner, so they aren't counted. Renders nothing.
export default function RecordOpen({ token }: { token: string }) {
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        let sent = false;

        function waitWhileVisible() {
            clearTimeout(timer);
            if (sent || document.visibilityState !== "visible") return;
            timer = setTimeout(() => {
                sent = true;
                recordOpen(token).catch(() => {});
            }, VISIBLE_FOR_MS);
        }

        waitWhileVisible();
        document.addEventListener("visibilitychange", waitWhileVisible);
        return () => {
            clearTimeout(timer);
            document.removeEventListener("visibilitychange", waitWhileVisible);
        };
    }, [token]);

    return null;
}
