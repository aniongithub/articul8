import { describe, it, expect } from "vitest";
import { sample, loop, clamp, type Track } from "../src/track";

// A track is read in absolute time now — the same currency a generator and a
// controller speak — so a keyframe channel and a wave are interchangeable. The
// track's own `wrap` says what a time past its span means; the default abstains.

const sway: Track = {
  duration: 1000,
  channels: { "head.rotation": { times: [0, 1000], values: [-10, 10] } },
};

describe("sample", () => {
  it("reads the clock in absolute time across the track's span", () => {
    expect(sample(sway, 0)["head.rotation"]).toBeCloseTo(-10);
    expect(sample(sway, 250)["head.rotation"]).toBeCloseTo(-5);
    expect(sample(sway, 500)["head.rotation"]).toBeCloseTo(0);
    expect(sample(sway, 1000)["head.rotation"]).toBeCloseTo(10);
  });

  it("abstains past the span by default — the transparent border", () => {
    expect("head.rotation" in sample(sway, 1500)).toBe(false);
    expect("head.rotation" in sample(sway, -200)).toBe(false);
  });

  it("only carries channels whose keys reach the sampled time", () => {
    const partial: Track = {
      duration: 1000,
      channels: {
        a: { times: [0, 1000], values: [0, 1] },
        b: { times: [0, 400], values: [0, 1] }, // b's keys stop at 400 ms
      },
    };
    const pose = sample(partial, 800);
    expect(pose["a"]).toBeCloseTo(0.8);
    expect("b" in pose).toBe(false);
  });

  it("a track's wrap completes its finite keys — loop tiles the span", () => {
    const looped: Track = { ...sway, wrap: loop };
    const ref = sample(sway, 250)["head.rotation"] as number;
    expect(sample(looped, 1250)["head.rotation"]).toBeCloseTo(ref);
    expect(sample(looped, -750)["head.rotation"]).toBeCloseTo(ref);
  });

  it("clamp holds the edge frames past the span", () => {
    const held: Track = { ...sway, wrap: clamp };
    expect(sample(held, 5000)["head.rotation"]).toBeCloseTo(10);
    expect(sample(held, -5000)["head.rotation"]).toBeCloseTo(-10);
  });
});
