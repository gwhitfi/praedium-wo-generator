import { FoxFrontPaths } from "./FoxMarks";

// Work Order Fox's horizontal lockup from the design sheet: the front-facing fox, then "Work Order Fox" in
// Bricolage Grotesque Bold with "Fox" in the brand orange (--brand-fox: #F6933A on dark, #D4621A on light).
// The fox keeps its own colors on both themes. Size it with a height class, e.g. "h-9 w-auto".
// textLength pins the wordmark's width, so it fits the viewBox even before the font has loaded.
export default function Logo({ className }: { className?: string }): React.ReactElement {
    return (
        <svg viewBox="0 0 296 64" role="img" aria-label="Work Order Fox" className={className}>
            <FoxFrontPaths />
            <text
                x={77}
                y={42}
                textLength={218}
                lengthAdjust="spacingAndGlyphs"
                fontSize={30.5}
                fontWeight={700}
                letterSpacing="-0.02em"
                style={{ fontFamily: "var(--font-bricolage), var(--font-figtree), sans-serif" }}
                className="fill-current"
            >
                Work Order <tspan className="fill-brand-fox">Fox</tspan>
            </text>
        </svg>
    );
}
