"use client";

import { useEffect, useState } from "react";

// `group` ("Organization", "You") is shown above its first section in the wide-screen column.
export type SettingsSection = { id: string; label: string; group: string };

// How far below the top of the window a section's top must reach to count as the one being read: below the sticky
// header, with some room.
const READING_LINE_PX = 140;

// The Settings page's section links: a row on phones, a sticky column on wide screens. The section being read is
// marked as current, following the scroll.
export default function SettingsNav({ sections }: { sections: SettingsSection[] }): React.ReactElement {
    const [current, setCurrent] = useState(sections[0]?.id);

    useEffect(() => {
        let frame = 0;
        function update() {
            frame = 0;
            let active = sections[0]?.id;
            for (const section of sections) {
                const element = document.getElementById(section.id);
                if (element && element.getBoundingClientRect().top <= READING_LINE_PX) active = section.id;
            }
            // At the very bottom, the last section is current even if it's too short to reach the line.
            if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
                active = sections[sections.length - 1]?.id;
            }
            setCurrent(active);
        }
        function onScroll() {
            if (!frame) frame = requestAnimationFrame(update);
        }
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", onScroll);
        return () => {
            window.removeEventListener("scroll", onScroll);
            window.removeEventListener("resize", onScroll);
            if (frame) cancelAnimationFrame(frame);
        };
    }, [sections]);

    return (
        <nav aria-label="Settings sections" className="mb-6 lg:mb-0">
            <ul className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 lg:sticky lg:top-24 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
                {sections.map((section, i) => {
                    const active = section.id === current;
                    const startsGroup = section.group !== sections[i - 1]?.group;
                    return (
                        <li key={section.id} className="shrink-0">
                            {startsGroup && (
                                <p
                                    className={`px-3 pb-1 text-xs font-medium uppercase tracking-wide text-subtle max-lg:hidden ${i > 0 ? "pt-4" : ""}`}
                                >
                                    {section.group}
                                </p>
                            )}
                            <a
                                href={`#${section.id}`}
                                aria-current={active ? "location" : undefined}
                                className={`block whitespace-nowrap rounded-md px-3 py-2 text-sm hover:bg-surface-hover hover:text-foreground ${
                                    active ? "bg-surface-hover font-medium text-foreground" : "text-muted"
                                }`}
                            >
                                {section.label}
                            </a>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}
