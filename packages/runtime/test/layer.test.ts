import { describe, it, expect } from "vitest";
import { clip, sampler, place, axis, mix, hold, clamp, loop, pingpong } from "../src/layer";
import { type Track } from "../src/track";

// A one-unit clip authored rest(0) -> full(1) on a single channel.
const ramp: Track = {
  duration: 1,
  channels: { "eye.x": { times: [0, 1], values: [0, 10] } },
};

describe("clip", () => {
  it("reads a track over its own [0,1]", () => {
    expect(clip(ramp)(0)["eye.x"]).toBeCloseTo(0);
    expect(clip(ramp)(0.5)["eye.x"]).toBeCloseTo(5);
    expect(clip(ramp)(1)["eye.x"]).toBeCloseTo(10);
  });
});

describe("wrap modes", () => {
  it("hold leaves the coordinate untouched (abstains past the edge)", () => {
    expect(hold(1.4)).toBeCloseTo(1.4);
    expect("eye.x" in sampler(clip(ramp), hold)(1.4)).toBe(false);
  });
  it("clamp holds the nearest edge", () => {
    expect(clamp(-0.3)).toBe(0);
    expect(clamp(1.3)).toBe(1);
    expect(sampler(clip(ramp), clamp)(1.3)["eye.x"]).toBeCloseTo(10);
  });
  it("loop tiles end to end", () => {
    expect(loop(1.25)).toBeCloseTo(0.25);
    expect(loop(-0.25)).toBeCloseTo(0.75);
    expect(sampler(clip(ramp), loop)(1.25)["eye.x"]).toBeCloseTo(2.5);
  });
  it("pingpong mirrors every other copy", () => {
    expect(pingpong(0.5)).toBeCloseTo(0.5);
    expect(pingpong(1.5)).toBeCloseTo(0.5);
    expect(pingpong(2)).toBeCloseTo(0);
  });
});

describe("place", () => {
  it("maps offset -> u=0 and offset+scale -> u=1", () => {
    const p = place(clip(ramp), { offset: 0, scale: 2000 });
    expect(p(0)["eye.x"]).toBeCloseTo(0); // begins here
    expect(p(1000)["eye.x"]).toBeCloseTo(5); // halfway
    expect(p(2000)["eye.x"]).toBeCloseTo(10); // ends here
  });
  it("a negative scale mirrors a clip onto the other side of its offset", () => {
    const left = place(clip(ramp), { offset: 0, scale: -1 });
    expect(left(0)["eye.x"]).toBeCloseTo(0); // rest at centre
    expect(left(-1)["eye.x"]).toBeCloseTo(10); // full at -1
    expect("eye.x" in left(1)).toBe(false); // abstains on the far side
  });
});

describe("axis", () => {
  // The look-at layout: two clips meeting at rest, one per side of centre.
  const lookX = axis(
    place(clip(ramp), { offset: 0, scale: +1 }), // right on [0, 1]
    place(clip(ramp), { offset: 0, scale: -1 }), // left on [-1, 0]
  );

  it("passes the lone in-range clip straight through (no overlap)", () => {
    expect(lookX(0.3)["eye.x"]).toBeCloseTo(3); // only the right clip votes
    expect(lookX(-0.3)["eye.x"]).toBeCloseTo(3); // only the left clip votes
  });

  it("sits at rest at centre, where both sides agree", () => {
    expect(lookX(0)["eye.x"]).toBeCloseTo(0);
  });
});

describe("mix", () => {
  it("folds layers over disjoint channels without a fight", () => {
    const pose = mix({ "eye.x": 4 }, { "eye.sy": 0.1 });
    expect(pose["eye.x"]).toBeCloseTo(4);
    expect(pose["eye.sy"]).toBeCloseTo(0.1);
  });

  it("blends a shared channel by weight", () => {
    const pose = mix([{ "eye.x": 0 }, 1], [{ "eye.x": 10 }, 3]);
    expect(pose["eye.x"]).toBeCloseTo(7.5); // (0*1 + 10*3) / 4
  });
});
