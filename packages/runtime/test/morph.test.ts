import { describe, it, expect } from "vitest";
import { blend } from "../src/pose";
import { sample } from "../src/track";
import { rig } from "../src/rig";

// Morph is not a new subsystem — it is the same channel, now carrying a vector.
// A shape key blends and samples by the very laws a bone angle does, and the
// skin reads it as this frame's rest so it still rides the bones on top.

describe("morph · blend (geometry votes)", () => {
  it("weight-averages a shape elementwise, the same law as a scalar", () => {
    const out = blend([{ eye: [0, 0, 10, 0] }, { eye: [10, 10, 10, 10] }], [1, 3]);
    expect(out.eye).toEqual([7.5, 7.5, 10, 7.5]);
  });

  it("lets a shape abstain — an absent geometry channel does not dilute", () => {
    const out = blend([{ eye: [2, 4] }, { mouth: [9, 9] }], [1, 9]);
    expect(out.eye).toEqual([2, 4]);
    expect(out.mouth).toEqual([9, 9]);
  });
});

describe("morph · skin (rides the bones)", () => {
  // One path, bound rigidly to `head` by `*`. A morph rewrites its rest points;
  // a bone translate must still carry the morphed shape on top of that.
  const svg = `<svg><path d="M0,0 L10,0"/></svg>`;
  const data = { bones: { head: {} }, skin: { head: { "0": { "*": 1 } } } };

  it("reads a geometry channel as rest, then applies the bone transform", () => {
    const skin = rig(data).bind(svg);
    // morph lifts both points to y=5; head.x=3 slides the morphed shape right.
    expect(skin.pose({ "0": [0, 5, 10, 5], "head.x": 3 }).get(0)).toBe("M3,5 L13,5");
  });

  it("falls through to the bound rest shape when no morph votes", () => {
    const skin = rig(data).bind(svg);
    expect(skin.pose({ "head.x": 3 }).get(0)).toBe("M3,0 L13,0");
  });
});

describe("morph · reconcile at bind (the lib matches unrelated shapes)", () => {
  // The target art lives in the SVG — an artist's hidden layer — and the
  // keyframe simply names it. Rest is whatever the driven path draws, so the
  // two shapes are reconciled to one topology only once the art is bound.
  const eye = "M0,0 L10,0 L5,10 Z";
  const heart = "M0,4 C0,0 -4,-2 -6,1 C-9,5 -3,9 0,12 C3,9 9,5 6,1 C4,-2 0,0 0,4 Z";
  const svg = `<svg><path id="eye" d="${eye}"/><path id="heart" style="display:none" d="${heart}"/></svg>`;
  const data = { animations: { m: { channels: { eye: { keys: { "1": "heart" } } } } } };

  it("reconciles the two shapes instead of rejecting a topology mismatch", () => {
    expect(() => rig(data).bind(svg)).not.toThrow();
  });

  it("fills the channel with one shared topology, rest → target", () => {
    const r = rig(data);
    r.bind(svg);
    const ch = r.tracks.m!.channels.eye!;
    expect(ch.times).toEqual([0, 1]);
    const [rest, target] = ch.values as number[][];
    expect(rest.length).toBe(target.length);
    expect(rest.length).toBeGreaterThan(4);
    expect(rest).not.toEqual(target);
  });

  it("samples the reconciled rest at weight 0 and the target at weight 1", () => {
    const r = rig(data);
    r.bind(svg);
    const t = r.tracks.m!;
    const at0 = sample(t, 0).eye as number[];
    const at1 = sample(t, 1).eye as number[];
    expect(at0.length).toBe(at1.length);
    expect(at0).not.toEqual(at1);
  });

  it("errors clearly when a keyframe names no object", () => {
    const bad = { animations: { m: { channels: { eye: { keys: { "1": "ghost" } } } } } };
    expect(() => rig(bad).bind(`<svg><path id="eye" d="${eye}"/></svg>`)).toThrow(/names no object/);
  });

  it("plays a self-referencing round trip: rest → target → rest, one reconcile", () => {
    // The eye names *itself* at 0 and 1 and the heart at the midpoint — a whole
    // bloom-and-settle clip, no code, still one target and one shared topology.
    const trip = {
      animations: { m: { channels: { eye: { keys: { "0": "eye", "0.5": "heart", "1": "eye" } } } } },
    };
    const r = rig(trip);
    r.bind(svg);
    const ch = r.tracks.m!.channels.eye!;
    expect(ch.times).toEqual([0, 0.5, 1]);
    const [a, b, c] = ch.values as number[][];
    expect(a).toEqual(c); // both ends are the very same rest vector
    expect(a).not.toEqual(b); // the middle is the reconciled target
    const t = r.tracks.m!;
    expect(sample(t, 0).eye).toEqual(a);
    expect(sample(t, 0.5).eye).toEqual(b);
    expect(sample(t, 1).eye).toEqual(c);
  });

  it("refuses a morph that blooms to more than one distinct target", () => {
    const two = {
      animations: { m: { channels: { eye: { keys: { "0.5": "heart", "1": "star" } } } } },
    };
    const art = `<svg><path id="eye" d="${eye}"/><path id="heart" d="${heart}"/><path id="star" d="${eye}"/></svg>`;
    expect(() => rig(two).bind(art)).toThrow(/one for now/);
  });
});
