"use client";

import { useEffect, useRef } from "react";
import { FOX_FRONT } from "@/lib/foxShapes";
import { type FoxHead, type FoxPose, foxHeadAt, foxHeadPose, foxHeadSettled, stepFoxHead } from "@/lib/foxTurn";

// The fox from the design sheet, turning its head to look where `facing` says: the front, or to its left (the
// dispatch fox mirrored). Each change of `facing` eases the head over in about 1.5s, carrying on from wherever it is
// (src/lib/foxTurn.ts), and it stops animating once it settles. With reduced motion it switches pose without turning.
// The server draws the still front fox. Decorative, so it's hidden from screen readers.
export default function FoxAnimation({
    facing,
    className,
}: {
    facing: "front" | "left";
    className?: string;
}): React.ReactElement {
    const group = useRef<SVGGElement>(null);
    // Kept across changes of `facing`, so a turn picks up from where the last one left off.
    const head = useRef<FoxHead>(foxHeadAt(0));

    useEffect(() => {
        const g = group.current;
        if (!g) return;
        const paths = Array.from(g.querySelectorAll("path"));
        const target = facing === "left" ? -1 : 0;

        function draw(pose: FoxPose) {
            if (pose.flip) g!.setAttribute("transform", "translate(64 0) scale(-1 1)");
            else g!.removeAttribute("transform");
            pose.d.forEach((d, i) => paths[i].setAttribute("d", d));
        }

        if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
            head.current = foxHeadAt(target);
            draw(foxHeadPose(head.current));
            return;
        }

        let frame = 0;
        let last: number | null = null;
        function tick(now: number) {
            const dt = last === null ? 0 : (now - last) / 1000;
            last = now;
            head.current = stepFoxHead(head.current, target, dt);
            if (foxHeadSettled(head.current, target)) {
                // At rest: show the drawn pose exactly and stop.
                head.current = foxHeadAt(target);
                draw(foxHeadPose(head.current));
                return;
            }
            draw(foxHeadPose(head.current));
            frame = requestAnimationFrame(tick);
        }
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [facing]);

    return (
        // The overshoot and the trailing ears reach a little outside the 64 by 64 box.
        <svg viewBox="0 0 64 64" aria-hidden className={`overflow-visible ${className ?? ""}`}>
            <g ref={group}>
                {FOX_FRONT.map((layer, i) => (
                    <path key={i} fill={layer.fill} d={layer.d} />
                ))}
            </g>
        </svg>
    );
}
