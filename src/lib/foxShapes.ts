// The two drawn foxes from the Work Order Fox design sheet, in a 64 by 64 box, drawn back to front.
// Front is the primary mark (the logo); Dispatch is the fox in profile facing right, its cheek ruff trailing into a
// chat-bubble point. The head-turn animation (src/lib/foxTurn.ts) moves between them, layer by layer and point by
// point, so both lists keep the same layers in the same order with the same commands.
export type FoxLayer = { fill: string; d: string };

export const FOX_FRONT: readonly FoxLayer[] = [
    {
        fill: "#E8721F",
        d: "M11 5 L26 19 L32 18 L38 19 L53 5 L54 26 L57.111111111111 30 L61 35 L53 37 L55 41 L43 47 L36 56 Q32 60 28 56 L21 47 L17 45 L9 41 L11 37 L3 35 L10 26 Z",
    },
    { fill: "#B24A14", d: "M15 13 L23 21 L16 25 Z" },
    { fill: "#B24A14", d: "M49 13 L48 25 L41 21 Z" },
    {
        fill: "#FFD9B8",
        d: "M3 35 L21 35 L27 42 L32 54 L37 42 L43 35 L61 35 L53 37 L55 41 L43 47 L36 56 Q32 60 28 56 L21 47 L9 41 L11 37 Z",
    },
    { fill: "#2A1608", d: "M38 31 L47 29 L45 33 L41 35 Z" },
    { fill: "#2A1608", d: "M17 29 L26 31 L23 35 L19 33 Z" },
    { fill: "#2A1608", d: "M27 49 L37 49 L33 54 L31 54 Z" },
];

export const FOX_DISPATCH: readonly FoxLayer[] = [
    {
        fill: "#E8721F",
        d: "M11 5 L26 19 L27.333333333333 15 L28 13 L30 7 L39 24 L47 29 L60 32 L55.5 37 L51 42 L42 45 L42 45 Q34 51 25 49 L12 60 L15 46 L5 41 L11 35 L7 29 L12 24 Z",
    },
    { fill: "#B24A14", d: "M15 13 L23 21 L16 25 Z" },
    { fill: "#B24A14", d: "M30 16 L34 25 L28 23 Z" },
    {
        fill: "#FFD9B8",
        d: "M8 38 L23 33 L35 38 L54 36 L54 36 L54 36 L54 36 L54 36 L51 42 L42 45 L42 45 Q34 51 25 49 L18 50 L18 50 L20 43 Z",
    },
    // The far eye, hidden behind the brow in profile: a speck, so it can grow back during the turn.
    { fill: "#2A1608", d: "M44.99 28.99 L45.01 28.99 L45.01 29.01 L44.99 29.01 Z" },
    { fill: "#2A1608", d: "M33 27 L42 30 L38 34 L33 32 Z" },
    { fill: "#2A1608", d: "M51 31 L58 33 L54 37 L50 35 Z" },
];
