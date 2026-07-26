import { describe, it, expect } from "vitest";
import { sampleClip, loop, clamp, pingpong, type Clip } from "../src/track";

// A clip is atomic keyframe data, read at a parameter `u`. Its `span` is the
// extent its own `wrap` is measured against; the default `hold` abstains past
// the edges (the transparent border). A clip knows nothing about clocks,
// coordinates, or who samples it — placement is a controller's job.

const sway: Clip = {
  span: 1000,
  channels: { "head.rotation": { times: [0, 1000], values: [-10, 10] } },
};

describe("sampleClip", () => {
  it("reads the parameter across the clip's span", () => {
    expect(sampleClip(sway, 0)["head.rotation"]).toBeCloseTo(-10);
    expect(sampleClip(sway, 250)["head.rotation"]).toBeCloseTo(-5);
    expect(sampleClip(sway, 500)["head.rotation"]).toBeCloseTo(0);
    expect(sampleClip(sway, 1000)["head.rotation"]).toBeCloseTo(10);
  });

  it("abstains past the span by default — the transparent border", () => {
    expect("head.rotation" in sampleClip(sway, 1500)).toBe(false);
    expect("head.rotation" in sampleClip(sway, -200)).toBe(false);
  });

  it("only carries channels whose keys reach the sampled parameter", () => {
    const partial: Clip = {
      span: 1000,
      channels: {
        a: { times: [0, 1000], values: [0, 1] },
        b: { times: [0, 400], values: [0, 1] }, // b's keys stop at 400
      },
    };
    const pose = sampleClip(partial, 800);
    expect(pose["a"]).toBeCloseTo(0.8);
    expect("b" in pose).toBe(false);
  });

  it("a clip's wrap completes its finite keys — loop tiles the span", () => {
    const looped: Clip = { ...sway, wrap: loop };
    const ref = sampleClip(sway, 250)["head.rotation"] as number;
    expect(sampleClip(looped, 1250)["head.rotation"]).toBeCloseTo(ref);
    expect(sampleClip(looped, -750)["head.rotation"]).toBeCloseTo(ref);
  });

  it("clamp holds the edge frames past the span", () => {
    const held: Clip = { ...sway, wrap: clamp };
    expect(sampleClip(held, 5000)["head.rotation"]).toBeCloseTo(10);
    expect(sampleClip(held, -5000)["head.rotation"]).toBeCloseTo(-10);
  });

  it("pingpong mirrors every other copy over the span", () => {
    const bounced: Clip = { ...sway, wrap: pingpong };
    const ref = sampleClip(sway, 250)["head.rotation"] as number;
    expect(sampleClip(bounced, 1750)["head.rotation"]).toBeCloseTo(ref);
  });

  it("a generator channel votes every frame and bypasses the wrap", () => {
    const wave: Clip = {
      span: 0,
      wrap: loop,
      channels: { g: { times: [], values: [], fn: (t) => t } },
    };
    // No keys, but the generator still votes — reading the raw parameter, not
    // the (span-0) wrap.
    expect(sampleClip(wave, 42)["g"]).toBeCloseTo(42);
    expect(sampleClip(wave, -3)["g"]).toBeCloseTo(-3);
  });
});
