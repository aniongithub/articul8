import { describe, it, expect } from "vitest";
import { rig } from "../src/rig";
import { sample } from "../src/track";

// Two paths; the second is bound rigidly to `head`, whose joint sits at the
// origin. A 90° turn should carry its points a quarter turn about (0,0).
const svg = `<svg><path d="M0,0"/><path d="M10,0 L10,10"/></svg>`;

const data = {
  bones: { head: {} },
  skin: { head: { "1": { "*": 1 } } },
};

describe("rig · skin (end to end)", () => {
  it("leaves points at rest under the empty pose (bind == pose at rest)", () => {
    const skin = rig(data).bind(svg);
    expect(skin.pose({}).get(1)).toBe("M10,0 L10,10");
  });

  it("carries bound points through the bone's world transform", () => {
    const skin = rig(data).bind(svg);
    // rotate 90° about the origin: (x, y) -> (-y, x).
    expect(skin.pose({ "head.rotation": 90 }).get(1)).toBe("M0,10 L-10,10");
  });

  it("never touches unbound objects", () => {
    const skin = rig(data).bind(svg);
    expect(skin.pose({ "head.rotation": 90 }).has(0)).toBe(false);
  });

  it("addresses objects by id as readily as by index", () => {
    const named = `<svg><path id="arm" d="M10,0"/></svg>`;
    const skin = rig({ bones: { head: {} }, skin: { head: { arm: { "*": 1 } } } }).bind(named);
    expect(skin.pose({ "head.x": 5 }).get(0)).toBe("M15,0");
  });

  it("carries per-keyframe Bézier handles from JSON through to eased sampling", () => {
    const eased = rig({
      animation: {
        move: {
          channels: {
            // key 0 leaves slowly (out handle pulled flat), so the midpoint reads low
            "head.x": { keys: { "0": { value: 0, out: [0.9, 0] }, "1000": 10 } },
          },
        },
      },
    }).tracks["move"]!;
    const plain = rig({
      animation: { move: { channels: { "head.x": { keys: { "0": 0, "1000": 10 } } } } },
    }).tracks["move"]!;
    expect(sample(eased, 0)["head.x"]).toBe(0);
    expect(sample(eased, 1000)["head.x"]).toBe(10);
    expect(sample(eased, 500)["head.x"] as number).toBeLessThan(5); // eased below the linear 5
    expect(sample(plain, 500)["head.x"]).toBeCloseTo(5);
  });

  it("resolves a track's named controller to the host closure that clocks it", () => {
    // The JSON only names `clock`; the host supplies the closure — an impure leaf
    // remapping the clock (offset by 200 ms) enters an otherwise pure track.
    const track = rig(
      {
        animation: {
          move: { controller: "clock", channels: { "head.x": { keys: { "0": 0, "1000": 10 } } } },
        },
      },
      { controllers: { clock: (t) => t - 200 } },
    ).tracks["move"]!;
    expect(sample(track, 200)["head.x"]).toBeCloseTo(0); // u = 0
    expect(sample(track, 1200)["head.x"]).toBeCloseTo(10); // u = 1000
  });

  it("throws when a track names a controller the host never supplied", () => {
    expect(() =>
      rig({
        animation: { move: { controller: "missing", channels: { "head.x": { keys: { "0": 0 } } } } },
      }),
    ).toThrow(/controller "missing"/);
  });
});

// A `mix` node fans its named inputs into `blend`, weighted by a controller that
// returns one fader per input. Two held one-key clips at 0 and 10 make the blend
// legible: the weight map slides the result along [0, 10].
const fold = (w: Record<string, number> | undefined) =>
  rig(
    {
      animation: {
        lo: { wrap: "clamp", channels: { "head.x": { keys: { "0": 0 } } } },
        hi: { wrap: "clamp", channels: { "head.x": { keys: { "0": 10 } } } },
        blend: { mix: ["lo", "hi"], by: "w" },
      },
    },
    { controllers: { w: () => w } },
  ).anims["blend"]!;

describe("rig · mix node (combinators as data)", () => {
  it("folds its named inputs through the controller's per-input weights", () => {
    expect(fold({ lo: 1, hi: 0 })(0)["head.x"]).toBeCloseTo(0);
    expect(fold({ lo: 0, hi: 1 })(0)["head.x"]).toBeCloseTo(10);
    expect(fold({ lo: 0.5, hi: 0.5 })(0)["head.x"]).toBeCloseTo(5);
    expect(fold({ lo: 3, hi: 1 })(0)["head.x"]).toBeCloseTo(2.5); // (3·0 + 1·10) / 4
  });

  it("abstains entirely when the controller abstains (undefined → no vote)", () => {
    expect(fold(undefined)(0)).toEqual({});
  });

  it("is oblivious to what its inputs carry — any channel folds the same", () => {
    // Same node shape, but the inputs drive a different channel entirely. No code
    // path names or inspects the channel; the crossfade is identical.
    const node = rig(
      {
        animation: {
          lo: { wrap: "clamp", channels: { "jaw.rotation": { keys: { "0": -20 } } } },
          hi: { wrap: "clamp", channels: { "jaw.rotation": { keys: { "0": 20 } } } },
          swing: { mix: ["lo", "hi"], by: "w" },
        },
      },
      { controllers: { w: () => ({ lo: 0.25, hi: 0.75 }) } },
    ).anims["swing"]!;
    expect(node(0)["jaw.rotation"]).toBeCloseTo(10); // (0.25·-20 + 0.75·20)
  });

  it("throws at build when a mix names an input that is no node", () => {
    expect(() =>
      rig(
        { animation: { lo: { channels: { "head.x": { keys: { "0": 0 } } } }, blend: { mix: ["lo", "ghost"], by: "w" } } },
        { controllers: { w: () => ({}) } },
      ),
    ).toThrow(/"ghost" not found/);
  });

  it("throws at build when a mix names a controller the host never supplied", () => {
    expect(() =>
      rig({ animation: { lo: { channels: { "head.x": { keys: { "0": 0 } } } }, blend: { mix: ["lo"], by: "gone" } } }),
    ).toThrow(/controller "gone"/);
  });

  it("throws when the weights name an input the node does not have", () => {
    expect(() => fold({ lo: 1, hi: 0, extra: 1 })(0)).toThrow(/unknown input "extra"/);
  });

  it("throws when the weights omit an input — N inputs demand N faders", () => {
    expect(() => fold({ lo: 1 })(0)).toThrow(/omits weight for input "hi"/);
  });

  it("throws when the controller hands back a scalar instead of a weights map", () => {
    const scalar = rig(
      {
        animation: {
          lo: { channels: { "head.x": { keys: { "0": 0 } } } },
          hi: { channels: { "head.x": { keys: { "0": 10 } } } },
          blend: { mix: ["lo", "hi"], by: "w" },
        },
      },
      { controllers: { w: () => 0.5 } },
    ).anims["blend"]!;
    expect(() => scalar(0)).toThrow(/per-input weights, not a scalar/);
  });
});
