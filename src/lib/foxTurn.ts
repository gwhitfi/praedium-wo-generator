import { FOX_DISPATCH, FOX_FRONT } from "./foxShapes";

// The fox's head turn from the design sheet (version 1, 2026-11-15). The pose function is ported from its motion code
// unchanged; the sheet's timed loop is replaced by a head that turns toward a target (below).
//
// One function of a signed number s draws the whole turn: s = 0 is the front fox, s = +1 the dispatch fox facing right,
// s = -1 the same drawing mirrored to face left. Between the two drawn poses every point runs on a smooth curve
// (Catmull-Rom) through 15 hand-placed in-between poses: the nose swings round on an arc, the near eye leads, the far
// ear and forehead lag, the far eye narrows behind the brow, the muzzle covers the far cheek and the neck ruff comes
// out late. Past +/-1 the pose carries on in its arrival direction, for the overshoot. At exactly 0 and +/-1 (with no
// lean) the drawn paths are returned untouched. The ear tips and the ruff can trail the head (the lean).

// The in-between poses at 1/16 ... 15/16 of the turn: KEYS[pose][layer] = x0, y0, x1, y1, ... in the same point order
// as the paths in foxShapes.ts.
// prettier-ignore
const KEYS: number[][][] = [
    [[11,5,26,19,31.92,17.95,37.84,18.9,52.76,5.02,53.76,25.97,56.63,29.98,60.9,35.02,52.98,37.04,54.98,41.04,43,47.27,38.08,55.85,34,59.9,29.82,55.81,21,47,16.92,45,8.75,41,11,36.88,3.18,34.73,10.13,25.88], [15,13,23,21,16,25], [48.8,13.03,47.85,25,40.86,21.02], [3.34,34.77,21.13,34.88,27.67,41.75,34.16,53.91,38.6,42.09,43.82,35.02,60.9,35.02,52.98,37.04,54.98,41.04,43,47.27,38.08,55.85,34,59.9,29.82,55.81,21,47,8.75,41,11,36.88], [39.33,30.95,47.66,29.07,45.72,32.98,41.96,34.89], [18.45,28.88,27.45,30.94,24.36,34.94,20.27,32.94], [29.35,48.91,39.06,48.92,35.06,53.92,32.86,53.91]],
    [[11,5,26,19,31.81,17.88,37.6,18.76,52.31,5.06,53.39,25.92,56.12,29.95,60.7,35.05,52.9,37.1,54.9,41.1,43.67,47.77,40.1,55.6,36,59.7,31.6,55.6,21,47,16.83,45,8.5,41,11,36.75,3.37,34.44,10.25,25.75], [15,13,23,21,16,25], [48.43,13.09,47.58,25,40.61,21.06], [3.77,34.56,21.25,34.75,28.34,41.5,36.29,53.65,40.17,42.19,44.63,35.04,60.7,35.05,52.9,37.1,54.9,41.1,43.67,47.77,40.1,55.6,36,59.7,31.6,55.6,21,47,8.5,41,11,36.75], [40.67,30.91,48.34,29.14,46.44,32.98,42.92,34.78], [19.9,28.75,28.9,30.88,25.72,34.88,21.54,32.88], [31.68,48.65,41.1,48.69,37.1,53.67,34.71,53.63]],
    [[11,5,26,19,31.66,17.78,37.28,18.57,51.68,5.12,52.92,25.86,55.58,29.91,60.26,35.12,52.63,37.19,54.7,41.19,45.37,47.95,41.98,55.08,38.02,59.24,33.27,55.32,21,47,16.75,45,8.25,41,11,36.63,3.58,34.13,10.38,25.63], [15,13,23,21,16,25], [47.91,13.17,47.2,25,40.25,21.11], [4.3,34.38,21.38,34.63,28.99,41.25,38.39,53.23,41.81,42.27,45.45,35.06,60.26,35.12,52.63,37.19,54.7,41.19,45.37,47.95,41.98,55.08,38.02,59.24,33.27,55.32,21,47,8.26,41,11,36.63], [41.98,30.86,48.97,29.22,47.15,32.95,43.88,34.66], [21.32,28.63,30.32,30.81,27.05,34.81,22.78,32.81], [33.97,48.23,43.1,48.31,39.1,53.27,36.52,53.18]],
    [[11,5,26,19,31.48,17.67,36.89,18.34,50.85,5.19,52.34,25.78,55.02,29.87,59.6,35.2,52.3,37.3,54.3,41.3,47.66,47.52,43.76,54.4,40,58.6,34.8,55,21,47,16.65,45.03,8,41,11,36.5,3.79,33.81,10.5,25.5], [15,13,23,21,16,25], [47.22,13.28,46.69,25,39.78,21.19], [4.9,34.23,21.5,34.5,29.64,41,40.42,52.63,43.6,42.3,46.3,35.1,59.6,35.2,52.3,37.3,54.3,41.3,47.66,47.52,43.76,54.4,40,58.6,34.8,55,21,47,8.59,41.27,11.1,36.59], [43.2,30.8,49.5,29.3,47.8,32.9,44.8,34.5], [22.7,28.5,31.7,30.75,28.34,34.75,23.99,32.75], [36.18,47.63,45.04,47.78,41.04,52.71,38.27,52.55]],
    [[11,5,26,19,31.27,17.53,36.43,18.06,49.84,5.28,51.65,25.69,54.44,29.82,58.62,35.3,52.04,37.45,53.48,41.5,49.53,46.58,45.47,53.58,41.88,57.76,36.12,54.66,20.96,47.06,16.5,45.12,7.75,41,11,36.38,4.02,33.48,10.63,25.38], [15,13,23,21,16,25], [46.39,13.41,46.08,25,39.21,21.27], [5.56,34.12,21.63,34.38,30.26,40.75,42.37,51.88,45.94,42.21,47.18,35.15,58.62,35.3,52.04,37.45,53.48,41.5,49.53,46.58,45.47,53.58,41.88,57.76,36.12,54.66,20.99,47.01,9.65,41.9,11.42,36.75], [44.37,30.71,49.91,29.4,48.42,32.8,45.74,34.27], [24.03,28.38,33.03,30.69,29.59,34.69,25.16,32.69], [38.31,46.88,46.9,47.11,42.9,51.99,39.96,51.76]],
    [[11,5,26,19,31.02,17.37,35.9,17.74,48.65,5.38,50.85,25.58,53.84,29.77,57.5,35.4,51.6,39.53,51.79,43.51,50.98,45.51,47,52.7,43.6,56.8,37.2,54.3,20.82,47.26,16.32,45.27,7.5,41,11,36.25,4.25,33.12,10.75,25.25], [15,13,23,21,16,25], [45.41,13.57,45.35,25,38.54,21.38], [6.27,34.06,21.75,34.25,30.87,40.5,44.22,50.97,48.4,42,48.09,35.2,57.5,35.4,51.6,39.53,51.79,43.51,50.98,45.51,47,52.7,43.6,56.8,37.2,54.3,20.94,47.06,11.16,42.77,11.96,37.1], [45.5,30.6,50.23,29.52,49.02,32.67,46.69,34], [25.31,28.25,34.31,30.63,30.79,34.63,26.27,32.63], [40.33,45.97,48.67,46.3,44.67,51.13,41.56,50.8]],
    [[11,5,26,19,30.74,17.19,35.31,17.39,47.3,5.5,49.96,25.46,53.22,29.71,56.48,35.5,52.3,43.48,52.39,44.34,52.41,44.39,48.4,51.79,45.35,55.62,38.13,53.95,20.54,47.66,16.12,45.44,7.25,41,11,36.13,4.5,32.75,10.88,25.13], [15,13,23,21,16,25], [44.29,13.74,44.53,25,37.77,21.5], [7.02,34.06,21.88,34.13,31.45,40.25,45.96,49.91,50.42,41.74,49.02,35.28,56.48,35.5,52.3,43.48,52.39,44.34,52.41,44.39,48.4,51.79,45.35,55.62,38.13,53.95,20.85,47.15,12.82,43.76,12.69,37.63], [46.51,30.49,50.46,29.63,49.53,32.53,47.54,33.73], [26.52,28.13,35.52,30.56,31.93,34.56,27.33,32.56], [42.23,44.91,50.32,45.37,46.32,50.14,43.05,49.69]],
    [[11,5,26,19,30.44,17,34.66,16.99,45.79,5.63,48.98,25.33,52.58,29.64,53.81,36.01,53.85,43.26,53.56,43.85,51.58,47.13,49.3,51,46.3,54.7,38.5,53.6,20.1,48.3,15.97,45.55,7,41,11,36,4.75,32.37,11,25], [15,13,23,21,16,25], [43.04,13.94,43.61,25,36.92,21.63], [7.79,34.13,22,34,31.99,40,47.56,48.73,52.2,41.4,50,35.4,53.81,36.01,53.85,43.26,53.56,43.85,51.58,47.13,49.3,51,46.3,54.7,38.5,53.6,20.7,47.3,14.42,44.57,13.59,38.3], [47.3,30.4,50.6,29.7,49.9,32.4,48.2,33.5], [27.65,28,36.65,30.5,32.98,34.5,28.32,32.5], [43.97,43.73,51.85,44.31,47.85,49.02,44.44,48.44]],
    [[11,5,26,19,30.11,16.79,33.95,16.57,44.14,5.77,47.92,25.19,51.92,29.57,52.48,35.84,55.23,42.1,52.89,46.46,49.24,50.57,49.24,50.57,45.29,54.76,37.83,53.27,19.42,49.28,15.86,45.58,6.75,41,11,35.88,5.01,31.98,11.13,24.88], [15,13,23,21,16,25], [41.68,14.16,42.61,25,35.99,21.77], [8.57,34.29,22.13,33.88,32.51,39.75,49.01,47.42,53.8,40.24,51.6,35.73,52.48,35.85,55.23,42.1,52.89,46.46,49.24,50.57,49.24,50.57,45.29,54.76,37.83,53.27,20.47,47.53,15.6,45.08,14.59,39.07], [48.16,30.23,50.49,29.73,50.04,31.86,48.81,32.73], [28.7,27.88,37.7,30.44,33.96,34.44,29.23,32.44], [45.55,42.42,53.23,43.15,49.23,47.78,45.69,47.05]],
    [[11,5,26,19,29.76,16.56,33.2,16.12,42.36,5.92,46.79,25.04,51.25,29.5,53.78,37.14,56.46,40.84,51.77,48.86,48.6,50.2,48.6,50.2,43.5,55,36.5,52.9,18.57,50.51,15.75,45.63,6.5,41,11,35.75,5.28,31.57,11.25,24.75], [15,13,23,21,16,25], [40.21,14.39,41.52,25,34.99,21.93], [9.39,34.53,22.25,33.75,32.99,39.5,50.29,46,55.77,40.08,54.92,38.83,55.29,39.22,56.46,40.84,51.77,48.86,48.6,50.2,48.6,50.2,43.5,55,36.5,52.9,20.19,47.81,15.95,45.38,15.66,39.89], [48.7,29.93,49.83,29.67,49.64,30.82,49.02,31.3], [29.64,27.75,38.64,30.38,34.85,34.38,30.06,32.38], [46.95,41,54.46,41.89,50.46,46.45,46.8,45.56]],
    [[11,5,26,19,29.39,16.32,32.4,15.64,40.48,6.09,45.59,24.88,50.56,29.42,56.94,38.94,57.52,39.49,51.89,48.13,47.51,49.66,47.51,49.66,41.77,54.76,34.64,52.44,17.61,51.9,15.63,45.69,6.25,41,11,35.63,5.56,31.16,11.38,24.63], [15,13,23,21,16,25], [38.66,14.63,40.38,25,33.92,22.09], [10.26,34.86,22.38,33.63,33.43,39.25,51.4,44.48,57.52,39.49,57.52,39.49,57.52,39.49,57.52,39.49,51.89,48.13,47.51,49.66,47.51,49.66,41.77,54.76,34.64,52.44,19.87,48.13,16.04,46,16.73,40.72], [48.52,29.61,48.78,29.54,48.74,29.83,48.6,29.96], [30.49,27.63,39.49,30.31,35.65,34.31,30.8,32.31], [48.17,39.48,55.52,40.54,51.52,45.01,47.76,43.96]],
    [[11,5,26,19,29,16.07,31.56,15.14,38.5,6.26,44.34,24.71,49.86,29.34,58.4,38.07,58.3,38.22,51.9,47.11,46.2,49,46.2,49,40,54.3,32.5,51.9,16.5,53.5,15.5,45.75,6,41,11,35.5,5.84,30.74,11.5,24.5], [15,13,23,21,16,25], [37.02,14.89,39.17,25,32.8,22.26], [11.11,35.29,22.5,33.5,33.84,39,52.33,42.89,56.63,39.48,56.63,39.48,56.63,39.48,56.63,39.48,51.9,47.11,46.2,49,46.2,49,40,54.3,32.5,51.9,19.5,48.5,16.31,47.06,17.74,41.49], [47.86,29.42,47.86,29.42,47.86,29.42,47.86,29.42], [31.23,27.5,40.23,30.25,36.34,34.25,31.45,32.25], [49.17,37.89,56.4,39.12,52.4,43.51,48.55,42.27]],
    [[11,5,26,19,28.59,15.81,30.7,14.62,36.44,6.44,43.05,24.54,49.16,29.26,59.1,36.6,58.16,37.8,51.8,46.02,44.96,48.16,44.96,48.16,38.36,53.62,30.36,51.23,15.13,55.47,15.38,45.81,5.75,41,11,35.38,6.13,30.31,11.63,24.38], [15,13,23,21,16,25], [35.32,15.16,37.92,25,31.64,22.44], [10.84,35.87,22.63,33.38,34.19,38.75,53.05,41.23,53.66,40.76,53.66,40.76,53.66,40.76,53.66,40.76,51.8,46.02,44.96,48.16,44.96,48.16,38.36,53.62,30.36,51.23,19.04,48.96,16.81,48.1,18.64,42.16], [47.16,29.32,47.16,29.32,47.16,29.32,47.16,29.32], [31.85,27.38,40.85,30.19,36.92,34.19,31.99,32.19], [49.97,36.23,57.1,37.65,53.1,41.94,49.18,40.52]],
    [[11,5,26,19,28.18,15.54,29.81,14.09,34.33,6.62,41.72,24.36,48.44,29.17,59.6,35.1,57.28,37.92,51.6,44.82,43.8,47.2,43.8,47.2,36.8,52.8,28.3,50.5,13.8,57.4,15.25,45.88,5.5,41,11,35.25,6.42,29.88,11.75,24.25], [15,13,23,21,16,25], [33.57,15.44,36.63,25,30.45,22.62], [9.9,36.53,22.75,33.25,34.51,38.5,53.58,39.51,53.58,39.51,53.58,39.51,53.58,39.51,53.58,39.51,51.6,44.82,43.8,47.2,43.8,47.2,36.8,52.8,28.3,50.5,18.6,49.4,17.36,49.04,19.36,42.68], [46.44,29.21,46.44,29.21,46.44,29.21,46.44,29.21], [32.35,27.25,41.35,30.13,37.39,34.13,32.44,32.13], [50.54,34.51,57.6,36.12,53.6,40.32,49.63,38.71]],
    [[11,5,26,19,27.76,15.27,28.91,13.54,32.17,6.81,40.36,24.18,47.72,29.09,59.9,33.56,56.18,37.87,51.37,43.44,42.86,46.13,42.86,46.13,35.38,51.92,26.59,49.76,12.84,58.78,15.13,45.94,5.25,41,11,35.13,6.71,29.44,11.88,24.13], [15,13,23,21,16,25], [31.8,15.72,35.32,25,29.23,22.81], [8.95,37.25,22.88,33.13,34.78,38.25,53.89,37.76,53.89,37.76,53.89,37.76,53.89,37.76,53.89,37.76,51.37,43.44,42.86,46.13,42.86,46.13,35.38,51.92,26.59,49.76,18.28,49.72,17.81,49.73,19.83,42.97], [45.72,29.11,45.72,29.11,45.72,29.11,45.72,29.11], [32.74,27.13,41.74,30.06,37.76,34.06,32.77,32.06], [50.88,32.76,57.9,34.57,53.9,38.67,49.91,36.86]],
];

const SEGS = KEYS.length + 1;

type Parsed = { cmds: string[]; counts: number[]; pts: number[] };

function parse(d: string): Parsed {
    const cmds: string[] = [];
    const counts: number[] = [];
    const pts: number[] = [];
    for (const m of d.matchAll(/([A-Za-z])([^A-Za-z]*)/g)) {
        const n = m[2].trim() ? m[2].trim().split(/[\s,]+/).map(Number) : [];
        cmds.push(m[1]);
        counts.push(n.length);
        pts.push(...n);
    }
    return { cmds, counts, pts };
}

type TurnLayer = {
    fill: string;
    cmds: string[];
    counts: number[];
    // P[0] = front, P[1..15] = the in-between poses, P[16] = dispatch.
    P: number[][];
    frontD: string;
    dispatchD: string;
    // Extra control points for the curve: before the front pose (the mirror partner's first step, so a sweep through
    // the front has no corner) and after the dispatch pose (straight on, for the overshoot).
    before: number[];
    after: number[];
};

const layers: TurnLayer[] = FOX_FRONT.map((layer, i) => {
    const f = parse(layer.d);
    const r = parse(FOX_DISPATCH[i].d);
    return {
        fill: layer.fill,
        cmds: f.cmds,
        counts: f.counts,
        P: [f.pts, ...KEYS.map((k) => k[i]), r.pts],
        frontD: layer.d,
        dispatchD: FOX_DISPATCH[i].d,
        before: [],
        after: [],
    };
});

// Which point (or which spot on an edge) of a same-coloured layer sits at this point's mirror image in the front
// drawing, which is symmetric about x = 32. Each entry: [layer, point, weight].
function findPartner(li: number, pi: number): [number, number, number][] | null {
    const F = layers[li].P[0];
    const mx = 64 - F[pi * 2];
    const my = F[pi * 2 + 1];
    const EPS = 1e-6;
    for (let a = 0; a < layers.length; a++) {
        if (layers[a].fill !== layers[li].fill) continue;
        const G = layers[a].P[0];
        for (let j = 0; j < G.length / 2; j++) {
            if (Math.abs(G[j * 2] - mx) < EPS && Math.abs(G[j * 2 + 1] - my) < EPS) return [[a, j, 1]];
        }
    }
    // Not a vertex: a spot on a straight edge.
    for (let a = 0; a < layers.length; a++) {
        if (layers[a].fill !== layers[li].fill) continue;
        const H = layers[a].P[0];
        const n = H.length / 2;
        for (let j = 0; j < n; j++) {
            const k = (j + 1) % n;
            const ax = H[j * 2];
            const ay = H[j * 2 + 1];
            const bx = H[k * 2];
            const by = H[k * 2 + 1];
            const len2 = (bx - ax) * (bx - ax) + (by - ay) * (by - ay);
            if (len2 < EPS) continue;
            const t = ((mx - ax) * (bx - ax) + (my - ay) * (by - ay)) / len2;
            if (t <= 0 || t >= 1) continue;
            const ex = ax + (bx - ax) * t - mx;
            const ey = ay + (by - ay) * t - my;
            if (ex * ex + ey * ey < 1e-8) {
                return [
                    [a, j, 1 - t],
                    [a, k, t],
                ];
            }
        }
    }
    return null;
}

for (const [li, L] of layers.entries()) {
    const n = L.P[0].length / 2;
    const last = L.P[SEGS];
    const prev = L.P[SEGS - 1];
    for (let pi = 0; pi < n; pi++) {
        const part = findPartner(li, pi);
        let x = 0;
        let y = 0;
        if (part) {
            for (const [a, j, w] of part) {
                const K1 = layers[a].P[1];
                x += w * (64 - K1[j * 2]);
                y += w * K1[j * 2 + 1];
            }
        } else {
            x = 2 * L.P[0][pi * 2] - L.P[1][pi * 2];
            y = L.P[1][pi * 2 + 1];
        }
        L.before.push(x, y);
        L.after.push(2 * last[pi * 2] - prev[pi * 2], 2 * last[pi * 2 + 1] - prev[pi * 2 + 1]);
    }
}

// Every layer's points at u in [0, 1], continued in a straight line a little past 1.
function pointsAt(u: number): number[][] {
    return layers.map((L) => {
        const n = L.P[0].length;
        const o = new Array<number>(n);
        if (u >= 1) {
            const D = L.P[SEGS];
            const Kn = L.P[SEGS - 1];
            const e = (u - 1) * SEGS;
            for (let i = 0; i < n; i++) o[i] = D[i] + (D[i] - Kn[i]) * e;
            return o;
        }
        const x = Math.max(0, u) * SEGS;
        const j = Math.min(Math.floor(x), SEGS - 1);
        const t = x - j;
        const t2 = t * t;
        const t3 = t2 * t;
        const p0 = j === 0 ? L.before : L.P[j - 1];
        const p1 = L.P[j];
        const p2 = L.P[j + 1];
        const p3 = j + 2 > SEGS ? L.after : L.P[j + 2];
        for (let i = 0; i < n; i++) {
            o[i] =
                0.5 *
                (2 * p1[i] +
                    (p2[i] - p0[i]) * t +
                    (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 +
                    (3 * p1[i] - p0[i] - 3 * p2[i] + p3[i]) * t3);
        }
        return o;
    });
}

// The ear tips and the ruff spike trail the head by `lean` units (+ = towards the right of the picture).
// Each row: [layer, point, weight at front, weight at dispatch, u where it starts].
const LEAN: [number, number, number, number, number][] = [
    [0, 0, 1, 1, 0], // near outer ear tip
    [0, 4, 1, 0.75, 0], // far outer ear tip
    [1, 0, 0.55, 0.55, 0], // near inner ear
    [1, 1, 0.12, 0.12, 0],
    [1, 2, 0.12, 0.12, 0],
    [2, 0, 0.55, 0.4, 0], // far inner ear
    [2, 1, 0.12, 0.09, 0],
    [2, 2, 0.12, 0.09, 0],
    [0, 14, 0, 1.1, 0.55], // ruff spike, only once it's out
];

function applyLean(pts: number[][], u: number, local: number): void {
    const c = Math.max(0, Math.min(1, u));
    for (const [layer, point, atFront, atDispatch, start] of LEAN) {
        let w: number;
        if (start > 0) {
            const g = Math.max(0, (c - start) / (1 - start));
            w = atDispatch * g * g;
        } else {
            w = atFront + (atDispatch - atFront) * c;
        }
        pts[layer][point * 2] += local * w;
    }
}

function toPath(L: TurnLayer, pts: number[]): string {
    let s = "";
    let k = 0;
    for (let c = 0; c < L.cmds.length; c++) {
        s += L.cmds[c];
        for (let j = 0; j < L.counts[c]; j++) s += (j ? " " : "") + pts[k++].toFixed(2);
        s += " ";
    }
    return s;
}

export type FoxPose = { flip: boolean; d: string[] };

// The fox at turn s (0 front, +1 dispatch facing right, -1 facing left) with the ears and ruff trailing by `lean`.
// `flip` means draw it mirrored about x = 32.
export function foxPose(s: number, lean = 0): FoxPose {
    const u = Math.abs(s);
    const flip = s < 0;
    if (!lean && u === 0) return { flip, d: layers.map((L) => L.frontD) };
    if (!lean && u === 1) return { flip, d: layers.map((L) => L.dispatchD) };
    const pts = pointsAt(u);
    if (lean) applyLean(pts, u, flip ? -lean : lean);
    return { flip, d: layers.map((L, i) => toPath(L, pts[i])) };
}

// ----- a head that turns toward a target -----
//
// Instead of the sheet's timed loop, the head eases toward wherever it's told to look (Fox Bot's page turns it toward
// the description box while that has focus). It's a soft spring: a turn takes about 1.5 seconds and runs about 3% past
// before settling, like the sheet's turn but slower, and a new target mid-turn carries on from where the head is,
// with no jump. The ear tips and ruff trail it with the sheet's own spring, worked out frame by frame.

// s: the turn (as in foxPose) and v its speed; lean: how far the ears and ruff trail, and leanV its speed.
export type FoxHead = { s: number; v: number; lean: number; leanV: number };

// A head at rest, looking at `s`.
export function foxHeadAt(s: number): FoxHead {
    return { s, v: 0, lean: 0, leanV: 0 };
}

// The head's spring: about 1.5s to settle, with damping 0.75 for a ~3% overshoot.
const HEAD_W = 3.5;
const HEAD_Z = 0.75;
// The ears' and ruff's spring, from the sheet.
const LEAN_PULL = 0.36;
const LEAN_W = 16;
const LEAN_Z = 0.42;
const LEAN_MAX = 1.8;
const STEP = 1 / 240;
// A long gap between frames (a background tab) is treated as this long, so the head never jumps.
const MAX_DT = 0.1;

// The head `dt` seconds later, turning toward `target`.
export function stepFoxHead(head: FoxHead, target: number, dt: number): FoxHead {
    let { s, v, lean, leanV } = head;
    const steps = Math.ceil(Math.min(Math.max(dt, 0), MAX_DT) / STEP);
    for (let i = 0; i < steps; i++) {
        v += (HEAD_W * HEAD_W * (target - s) - 2 * HEAD_Z * HEAD_W * v) * STEP;
        s += v * STEP;
        leanV += (LEAN_W * LEAN_W * (-LEAN_PULL * v - lean) - 2 * LEAN_Z * LEAN_W * leanV) * STEP;
        lean = Math.max(-LEAN_MAX, Math.min(LEAN_MAX, lean + leanV * STEP));
    }
    return { s, v, lean, leanV };
}

// True once the head has come to rest on `target`, so the caller can show the drawn pose and stop animating.
export function foxHeadSettled(head: FoxHead, target: number): boolean {
    return (
        Math.abs(head.s - target) < 0.002 &&
        Math.abs(head.v) < 0.01 &&
        Math.abs(head.lean) < 0.004 &&
        Math.abs(head.leanV) < 0.05
    );
}

// The fox drawn for a head; a negligible lean counts as none, so a resting head shows the drawn pose.
export function foxHeadPose(head: FoxHead): FoxPose {
    return foxPose(head.s, Math.abs(head.lean) < 0.004 ? 0 : head.lean);
}
