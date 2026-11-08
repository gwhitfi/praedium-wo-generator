"use client";

import { useRef } from "react";

const VIDEO_SRC = "/videos/ai-work-order-demo.mp4";

// A button that opens the AI work order demo in a modal player. The native <dialog> handles Escape and focus;
// clicking the backdrop also closes it, and closing pauses the video.
export default function AiDemoVideo({
    label = "Watch how it works",
    className,
}: {
    label?: string;
    className?: string;
}): React.ReactElement {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);

    function open() {
        dialogRef.current?.showModal();
        videoRef.current?.play().catch(() => {
            // Autoplay can be blocked; the controls are there to start it.
        });
    }

    function close() {
        dialogRef.current?.close();
    }

    return (
        <>
            <button
                type="button"
                onClick={open}
                className={
                    className ??
                    "inline-flex items-center gap-1.5 text-sm text-accent hover:text-accent-hover hover:cursor-pointer"
                }
            >
                <PlayIcon />
                {label}
            </button>
            <dialog
                ref={dialogRef}
                onClose={() => videoRef.current?.pause()}
                onClick={(e) => {
                    if (e.target === dialogRef.current) close();
                }}
                aria-label="Praedium Bot demo"
                className="m-auto w-[min(1100px,calc(100vw-2rem))] rounded-lg border border-line bg-surface p-0 text-foreground shadow-xl backdrop:bg-black/70"
            >
                <div className="flex items-center justify-between border-b border-line px-4 py-2">
                    <p className="text-sm font-medium">Creating a work order with Praedium Bot</p>
                    <button
                        type="button"
                        onClick={close}
                        aria-label="Close video"
                        className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground hover:cursor-pointer"
                    >
                        <CloseIcon />
                    </button>
                </div>
                <video ref={videoRef} src={VIDEO_SRC} controls playsInline preload="none" className="block w-full" />
            </dialog>
        </>
    );
}

const iconProps = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
} as const;

function PlayIcon() {
    return (
        <svg width={16} height={16} {...iconProps}>
            <circle cx="12" cy="12" r="10" />
            <path d="M10 8.5v7l6-3.5-6-3.5Z" />
        </svg>
    );
}

function CloseIcon() {
    return (
        <svg width={20} height={20} {...iconProps}>
            <path d="M6 6l12 12M18 6L6 18" />
        </svg>
    );
}
