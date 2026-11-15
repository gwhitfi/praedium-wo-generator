import { FOX_DISPATCH, FOX_FRONT, type FoxLayer } from "@/lib/foxShapes";

// The design sheet's two foxes. They keep their own colours on every theme.

function Layers({ layers }: { layers: readonly FoxLayer[] }) {
    return (
        <>
            {layers.map((layer, i) => (
                <path key={i} fill={layer.fill} d={layer.d} />
            ))}
        </>
    );
}

// The front-facing fox as bare paths in a 64 by 64 box, for drawing inside another SVG (the logo).
export function FoxFrontPaths(): React.ReactElement {
    return <Layers layers={FOX_FRONT} />;
}

// The dispatch fox: in profile facing right, its cheek ruff trailing into a chat-bubble point. The sheet uses it where
// the app sends or tells someone something, and it reads best from about 24px up. Decorative: label what it sits in.
export function FoxDispatch({ className }: { className?: string }): React.ReactElement {
    return (
        <svg viewBox="0 0 64 64" aria-hidden className={className}>
            <Layers layers={FOX_DISPATCH} />
        </svg>
    );
}
