import { describe, it, expect } from "vitest";
import { sample, type Track } from "../src/track";

const sway: Track = {
  duration: 1000,
  channels: { "head.rotation": { times: [0, 1000], values: [-10, 10] } },
};

describe("sample", () => {
  it("reads u in [0,1] as a coordinate across the whole track", () => {
    expect(sample(sway, 0)["head.rotation"]).toBeCloseTo(-10);
    expect(sample(sway, 0.25)["head.rotation"]).toBeCloseTo(-5);
    expect(sample(sway, 0.5)["head.rotation"]).toBeCloseTo(0);
    expect(sample(sway, 1)["head.rotation"]).toBeCloseTo(10);
  });

  it("abstains outside [0,1] — the transparent border, so wrap alone decides", () => {
    expect("head.rotation" in sample(sway, 1.5)).toBe(false);
    expect("head.rotation" in sample(sway, -0.2)).toBe(false);
  });

  it("only carries channels whose keys reach the sampled time", () => {
    const partial: Track = {
      duration: 1000,
      channels: {
        a: { times: [0, 1000], values: [0, 1] },
        b: { times: [0, 400], values: [0, 1] }, // b's keys stop at 40% of the span
      },
    };
    const pose = sample(partial, 0.8);
    expect(pose["a"]).toBeCloseTo(0.8);
    expect("b" in pose).toBe(false);
  });
});
