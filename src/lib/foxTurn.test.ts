import { describe, expect, it } from "vitest";
import { FOX_DISPATCH, FOX_FRONT } from "./foxShapes";
import { type FoxHead, foxHeadAt, foxHeadPose, foxHeadSettled, foxPose, stepFoxHead } from "./foxTurn";

const front = FOX_FRONT.map((l) => l.d);
const dispatch = FOX_DISPATCH.map((l) => l.d);

describe("foxPose", () => {
    it("returns the drawn poses untouched at the front and fully turned", () => {
        expect(foxPose(0)).toEqual({ flip: false, d: front });
        expect(foxPose(1)).toEqual({ flip: false, d: dispatch });
    });

    it("faces left as the same drawing mirrored", () => {
        expect(foxPose(-1)).toEqual({ flip: true, d: dispatch });
        expect(foxPose(-0.4).d).toEqual(foxPose(0.4).d);
        expect(foxPose(-0.4).flip).toBe(true);
    });

    it("keeps every layer's commands while turning", () => {
        const pose = foxPose(0.5, 0.8);
        expect(pose.d).toHaveLength(front.length);
        pose.d.forEach((d, i) => {
            expect(d.replace(/[^A-Za-z]/g, "")).toBe(front[i].replace(/[^A-Za-z]/g, ""));
            expect(d).not.toMatch(/NaN|Infinity/);
        });
    });

    it("joins the drawn poses smoothly at both ends", () => {
        const numbers = (d: string[]) => d.join(" ").match(/-?\d+(\.\d+)?/g)!.map(Number);
        const near = (a: number[], b: number[]) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
        expect(near(numbers(foxPose(0.0001).d), numbers(front))).toBeLessThan(0.05);
        expect(near(numbers(foxPose(0.9999).d), numbers(dispatch))).toBeLessThan(0.05);
    });
});

// Runs the head toward `target` in 60fps frames for `seconds`, returning every frame.
function run(head: FoxHead, target: number, seconds: number): FoxHead[] {
    const frames: FoxHead[] = [];
    for (let i = 0; i < Math.round(seconds * 60); i++) {
        head = stepFoxHead(head, target, 1 / 60);
        frames.push(head);
    }
    return frames;
}

describe("the turning head", () => {
    it("turns slowly to the target, runs a little past, is there by 2 seconds and comes to rest by 2.5", () => {
        const frames = run(foxHeadAt(0), -1, 3);
        const at = (seconds: number) => frames[Math.round(seconds * 60) - 1].s;
        expect(at(0.25)).toBeGreaterThan(-0.4);
        expect(at(0.25)).toBeLessThan(0);
        const furthest = Math.min(...frames.map((f) => f.s));
        expect(furthest).toBeLessThan(-1.01);
        expect(furthest).toBeGreaterThan(-1.05);
        expect(Math.abs(at(2) + 1)).toBeLessThan(0.01);
        const settled = frames.findIndex((f) => foxHeadSettled(f, -1));
        expect(settled).toBeGreaterThan(0);
        expect(settled / 60).toBeLessThan(2.5);
    });

    it("trails its ears while turning and brings them back to rest", () => {
        const frames = run(foxHeadAt(0), -1, 3);
        expect(Math.max(...frames.map((f) => Math.abs(f.lean)))).toBeGreaterThan(0.05);
        expect(Math.abs(frames.at(-1)!.lean)).toBeLessThan(0.004);
    });

    it("shows the drawn pose once it has settled", () => {
        const last = run(foxHeadAt(0), -1, 3).at(-1)!;
        const pose = foxHeadPose({ ...last, s: -1 });
        expect(pose).toEqual({ flip: true, d: dispatch });
        expect(foxHeadPose(foxHeadAt(0))).toEqual({ flip: false, d: front });
    });

    it("turns back from wherever it is, with no jump", () => {
        const halfway = run(foxHeadAt(0), -1, 0.4).at(-1)!;
        const back = run(halfway, 0, 3);
        expect(Math.abs(back[0].s - halfway.s)).toBeLessThan(0.05);
        for (let i = 1; i < back.length; i++) expect(Math.abs(back[i].s - back[i - 1].s)).toBeLessThan(0.05);
        expect(foxHeadSettled(back.at(-1)!, 0)).toBe(true);
    });

    it("stays still when already looking at the target", () => {
        expect(stepFoxHead(foxHeadAt(0), 0, 1 / 60)).toEqual(foxHeadAt(0));
    });

    it("never jumps after a long gap between frames", () => {
        const late = stepFoxHead(foxHeadAt(0), -1, 5);
        const normal = stepFoxHead(foxHeadAt(0), -1, 0.1);
        expect(late).toEqual(normal);
    });
});
