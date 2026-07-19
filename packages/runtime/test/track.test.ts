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

  it("a coord controller supplies the clock; a keyframe channel reads through it", () => {
    // The controller remaps the real time to a click-relative one — here it just
    // offsets by 500 ms, so the track reads as if the clock were `t - 500`.
    const clicked: Track = { ...sway, coord: (t) => t - 500 };
    expect(sample(clicked, 500)["head.rotation"]).toBeCloseTo(-10); // u = 0
    expect(sample(clicked, 1500)["head.rotation"]).toBeCloseTo(10); // u = 1000
  });

  it("wrap still trims the coord the controller supplies", () => {
    // The controller hands back a time past the span; the track's own wrap tiles
    // it — so timing (controller) and edge behaviour (wrap) compose orthogonally.
    const looped: Track = { ...sway, wrap: loop, coord: (t) => t + 1000 };
    const ref = sample(sway, 250)["head.rotation"] as number;
    expect(sample(looped, 250)["head.rotation"]).toBeCloseTo(ref);
  });

  it("a controller abstains with undefined; the whole track casts no vote", () => {
    const gated: Track = { ...sway, coord: () => undefined };
    expect("head.rotation" in sample(gated, 250)).toBe(false);
  });
});
