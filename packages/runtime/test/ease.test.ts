import { describe, it, expect } from "vitest";
import { linear, bezier, segment, type Handle } from "../src/ease";
import { sample, type Track } from "../src/track";

// An easing is a reparam of the unit interval that fixes both ends. So every
// curve must agree at 0 and 1 — they only disagree on *how* they cross between.

const easeIn = bezier(0.42, 0, 1, 1); // slow to leave
const easeOut = bezier(0, 0, 0.58, 1); // gentle to arrive
const easeInOut = bezier(0.42, 0, 0.58, 1); // both ends

describe("ease · bézier fixes both ends", () => {
  it("every curve maps 0→0 and 1→1", () => {
    for (const e of [linear, easeIn, easeOut, easeInOut]) {
      expect(e(0)).toBe(0);
      expect(e(1)).toBe(1);
    }
  });

  it("control points on the diagonal are exactly linear", () => {
    expect(bezier(1 / 3, 1 / 3, 2 / 3, 2 / 3)).toBe(linear);
    expect(bezier(0.25, 0.25, 0.9, 0.9)(0.4)).toBeCloseTo(0.4);
  });

  it("in reads below linear, out above, at the midpoint", () => {
    expect(easeIn(0.5)).toBeLessThan(0.5);
    expect(easeOut(0.5)).toBeGreaterThan(0.5);
  });

  it("inout is symmetric about the centre", () => {
    expect(easeInOut(0.5)).toBeCloseTo(0.5);
    expect(easeInOut(0.25) + easeInOut(0.75)).toBeCloseTo(1);
  });

  it("is monotonic — it never runs backwards", () => {
    let prev = -1;
    for (let f = 0; f <= 1.0001; f += 0.05) {
      const y = easeInOut(Math.min(f, 1));
      expect(y).toBeGreaterThanOrEqual(prev);
      prev = y;
    }
  });
});

// A segment's curve is the left key's `out` handle meeting the right key's `in`.
// Omit either and that side falls to the diagonal — piecewise linear by default.

describe("ease · segment from two handles", () => {
  it("both handles absent is linear", () => {
    expect(segment(undefined, undefined)).toBe(linear);
  });

  it("mirrors bezier when both handles are given", () => {
    const out: Handle = [0.42, 0];
    const inn: Handle = [0.58, 1];
    const s = segment(out, inn);
    const b = bezier(0.42, 0, 0.58, 1);
    for (const f of [0.2, 0.5, 0.8]) expect(s(f)).toBeCloseTo(b(f));
  });
});

// The payoff: an easing bends the *timing* of a tween, not its values. A channel
// with an `in` easing lands the same 0 and 10, but reads low at the midpoint.

describe("ease · sample bends a channel's fraction", () => {
  const eased: Track = {
    duration: 1,
    channels: { a: { times: [0, 1], values: [0, 10], eases: [easeIn] } },
  };
  const plain: Track = {
    duration: 1,
    channels: { a: { times: [0, 1], values: [0, 10] } },
  };

  it("agrees at the keys, differs between them", () => {
    expect(sample(eased, 0).a).toBe(0);
    expect(sample(eased, 1).a).toBe(10);
    expect(sample(eased, 0.5).a as number).toBeLessThan(5); // eased below linear
    expect(sample(plain, 0.5).a).toBeCloseTo(5);
  });

  it("bends a vector value by the very same fraction, elementwise", () => {
    const t: Track = {
      duration: 1,
      channels: { p: { times: [0, 1], values: [[0, 0], [10, 20]], eases: [easeIn] } },
    };
    const [x, y] = sample(t, 0.5).p as number[];
    expect(y).toBeCloseTo(2 * x!); // same fraction on both components
  });
});
