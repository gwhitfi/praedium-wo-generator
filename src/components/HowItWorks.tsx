"use client";

import { useEffect, useRef, useState } from "react";

const STEPS = [
    {
        title: "Add a property",
        description: "Save the address and property details so everything is ready when a repair comes up.",
        video: "add-property",
    },
    {
        title: "Add a contractor",
        description: "Keep your contractor’s contact details and preferences in one place, ready for the next job.",
        video: "add-contractor",
    },
    {
        title: "Create and send a work order",
        description:
            "Choose a property and contractor, describe the repair, and add a deadline, priority, and photos. Then send it their way.",
        video: "create-work-order",
    },
    {
        title: "Follow the work through to completion",
        description:
            "Your contractor checks off repairs and leaves notes using their link. Review the completed work and close it out.",
        video: "complete-work-order",
    },
];

const PLAYBACK_SPEED = 1.75;

function applyPlaybackSpeed(video: HTMLVideoElement) {
    video.defaultPlaybackRate = PLAYBACK_SPEED;
    video.playbackRate = PLAYBACK_SPEED;
}

export default function HowItWorks() {
    const [index, setIndex] = useState(0);
    const videoRef = useRef<HTMLVideoElement>(null);
    const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const step = STEPS[index];
    const cancelAdvance = () => {
        if (advanceTimer.current !== null) {
            clearTimeout(advanceTimer.current);
            advanceTimer.current = null;
        }
    };
    const changeStep = (direction: number) => {
        cancelAdvance();
        setIndex((current) => (current + direction + STEPS.length) % STEPS.length);
    };
    const scheduleAdvance = () => {
        cancelAdvance();
        advanceTimer.current = setTimeout(() => changeStep(1), 1500);
    };

    // Metadata may load before hydration; also reapply after a slide or speed change.
    useEffect(() => {
        if (videoRef.current) applyPlaybackSpeed(videoRef.current);
    });

    useEffect(() => {
        return () => {
            if (advanceTimer.current !== null) clearTimeout(advanceTimer.current);
        };
    }, []);

    return (
        <section
            className="mt-12 border-t border-line pt-10"
            aria-labelledby="how-it-works-title"
            aria-roledescription="carousel"
        >
            <h2 id="how-it-works-title" className="text-center text-4xl font-semibold sm:text-5xl">
                How it works
            </h2>
            <div
                id="how-it-works-slide"
                role="group"
                aria-roledescription="slide"
                aria-label={`${index + 1} of ${STEPS.length}`}
                className="mt-5"
            >
                <div className="mb-5 text-center">
                    <div className="flex items-center justify-center gap-4">
                        <button
                            type="button"
                            onClick={() => changeStep(-1)}
                            aria-label="Previous video"
                            aria-controls="how-it-works-slide"
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-muted transition-colors hover:border-line-hover hover:bg-surface hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
                        >
                            <Arrow direction="left" />
                        </button>
                        <p className="text-xs font-medium uppercase tracking-wider text-subtle" aria-live="polite">
                            Step {index + 1} of {STEPS.length}
                        </p>
                        <button
                            type="button"
                            onClick={() => changeStep(1)}
                            aria-label="Next video"
                            aria-controls="how-it-works-slide"
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-muted transition-colors hover:border-line-hover hover:bg-surface hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
                        >
                            <Arrow direction="right" />
                        </button>
                    </div>
                    <div aria-live="polite" aria-atomic="true">
                        <h3 className="mt-2 text-xl font-semibold text-accent sm:text-2xl">{step.title}</h3>
                        <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted">{step.description}</p>
                    </div>
                </div>
                <video
                    key={step.video}
                    ref={videoRef}
                    autoPlay
                    muted
                    controls
                    playsInline
                    preload="auto"
                    onLoadedMetadata={(event) => {
                        applyPlaybackSpeed(event.currentTarget);
                    }}
                    onEnded={scheduleAdvance}
                    onPlay={(event) => {
                        cancelAdvance();
                        applyPlaybackSpeed(event.currentTarget);
                    }}
                    onSeeking={cancelAdvance}
                    poster={`/how-it-works/${step.video}.webp`}
                    aria-label={step.title}
                    width={1280}
                    height={800}
                    className="aspect-[8/5] w-full rounded-lg border border-line bg-black"
                >
                    <source src={`/how-it-works/${step.video}.mp4`} type="video/mp4" />
                    Your browser does not support video playback.{" "}
                    <a href={`/how-it-works/${step.video}.mp4`}>Download the video.</a>
                </video>
            </div>
        </section>
    );
}

function Arrow({ direction }: { direction: "left" | "right" }) {
    return (
        <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d={direction === "left" ? "m14 6-6 6 6 6" : "m10 6 6 6-6 6"} />
        </svg>
    );
}
