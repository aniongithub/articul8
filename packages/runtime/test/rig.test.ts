import { describe, it, expect } from "vitest";
import { rig } from "../src/rig";
import { sampleClip } from "../src/track";

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
      clips: {
        move: {
          channels: {
            // key 0 leaves slowly (out handle pulled flat), so the midpoint reads low
            "head.x": { keys: { "0": { value: 0, out: [0.9, 0] }, "1000": 10 } },
          },
        },
      },
    }).clips["move"]!;
    const plain = rig({
      clips: { move: { channels: { "head.x": { keys: { "0": 0, "1000": 10 } } } } },
    }).clips["move"]!;
    expect(sampleClip(eased, 0)["head.x"]).toBe(0);
    expect(sampleClip(eased, 1000)["head.x"]).toBe(10);
    expect(sampleClip(eased, 500)["head.x"] as number).toBeLessThan(5); // eased below the linear 5
    expect(sampleClip(plain, 500)["head.x"]).toBeCloseTo(5);
  });
});

// A controller places clips on a coordinate. The gaze layout: two canonical
// clips, each rest(0)→extreme(1), placed at offset ∓1 so the cursor value `v`
// samples each at `u = v / offset`. The two half-axes resolve to one value by
// the abstain (hold past the edge) + carrier-normalized blend laws.
const gaze = (v: number | undefined) =>
  rig(
    {
      clips: {
        gazeLeft: { channels: { "eye.x": { keys: { "0": 0, "1": -10 } } } },
        gazeRight: { channels: { "eye.x": { keys: { "0": 0, "1": 10 } } } },
      },
      controllers: {
        gazeX: {
          kind: "number",
          editor: { as: "coordinate", range: [-1, 1], default: 0 },
          clips: [
            { clip: "gazeLeft", offset: -1 },
            { clip: "gazeRight", offset: 1 },
          ],
        },
      },
    },
    { controllers: { gazeX: () => v } },
  ).anims["gazeX"]!(0);

describe("rig · controller (places clips on a coordinate)", () => {
  it("reaches each clip's extreme at the coordinate its offset lands on", () => {
    expect(gaze(-1)["eye.x"]).toBeCloseTo(-10); // gazeLeft at u=1
    expect(gaze(1)["eye.x"]).toBeCloseTo(10); // gazeRight at u=1
  });

  it("sits at rest at centre, where both halves agree at u=0", () => {
    expect(gaze(0)["eye.x"]).toBeCloseTo(0);
  });

  it("reads one value from two half-axis clips (the lone in-range clip passes through)", () => {
    expect(gaze(0.5)["eye.x"]).toBeCloseTo(5); // only gazeRight votes
    expect(gaze(-0.5)["eye.x"]).toBeCloseTo(-5); // only gazeLeft votes
  });

  it("abstains entirely when its source abstains (undefined → no vote)", () => {
    expect(gaze(undefined)).toEqual({});
  });

  it("clocks a clip through its offset — u = t / offset", () => {
    // A clock controller places one clip and scrubs it by the raw clock: at
    // offset 900 the clip's full extreme lands at t = 900 ms.
    const heart = (t: number) =>
      rig(
        {
          // A canonical [0,1] pulse; offset 900 lands its full extreme at t=900 ms.
          clips: { pulse: { wrap: "clamp", channels: { "head.x": { keys: { "0": 0, "1": 10 } } } } },
          controllers: { heartClock: { editor: { as: "clock" }, clips: [{ clip: "pulse", offset: 900 }] } },
        },
        { controllers: { heartClock: (t) => t } },
      ).anims["heartClock"]!(t);
    expect(heart(0)["head.x"]).toBeCloseTo(0);
    expect(heart(450)["head.x"]).toBeCloseTo(5);
    expect(heart(900)["head.x"]).toBeCloseTo(10);
  });

  it("throws when a controller places a clip that does not exist", () => {
    expect(() =>
      rig(
        {
          clips: { a: { channels: { "eye.x": { keys: { "0": 0 } } } } },
          controllers: { c: { editor: { as: "coordinate" }, clips: [{ clip: "ghost", offset: 1 }] } },
        },
        { controllers: { c: () => 0 } },
      ),
    ).toThrow(/places unknown clip "ghost"/);
  });

  it("throws when its source returns weights instead of a coordinate", () => {
    const bad = rig(
      {
        clips: { a: { channels: { "eye.x": { keys: { "0": 0, "1": 10 } } } } },
        controllers: { c: { editor: { as: "coordinate" }, clips: [{ clip: "a", offset: 1 }] } },
      },
      { controllers: { c: () => ({ a: 1 }) as unknown as number } },
    ).anims["c"]!;
    expect(() => bad(0)).toThrow(/coordinate, not weights/);
  });
});

// A `mix` node fans its named inputs into `blend`, weighted by a controller that
// returns one fader per input. Two held one-key clips at 0 and 10 make the blend
// legible: the weight map slides the result along [0, 10].
const fold = (w: Record<string, number> | undefined) =>
  rig(
    {
      clips: {
        lo: { wrap: "clamp", channels: { "head.x": { keys: { "0": 0 } } } },
        hi: { wrap: "clamp", channels: { "head.x": { keys: { "0": 10 } } } },
      },
      mixes: { blend: { mix: ["lo", "hi"], by: "w" } },
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
        clips: {
          lo: { wrap: "clamp", channels: { "jaw.rotation": { keys: { "0": -20 } } } },
          hi: { wrap: "clamp", channels: { "jaw.rotation": { keys: { "0": 20 } } } },
        },
        mixes: { swing: { mix: ["lo", "hi"], by: "w" } },
      },
      { controllers: { w: () => ({ lo: 0.25, hi: 0.75 }) } },
    ).anims["swing"]!;
    expect(node(0)["jaw.rotation"]).toBeCloseTo(10); // (0.25·-20 + 0.75·20)
  });

  it("throws at build when a mix names an input that is no node", () => {
    expect(() =>
      rig(
        {
          clips: { lo: { channels: { "head.x": { keys: { "0": 0 } } } } },
          mixes: { blend: { mix: ["lo", "ghost"], by: "w" } },
        },
        { controllers: { w: () => ({}) } },
      ),
    ).toThrow(/"ghost" not found/);
  });

  it("throws at build when a mix names a controller the host never supplied", () => {
    expect(() =>
      rig({
        clips: { lo: { channels: { "head.x": { keys: { "0": 0 } } } } },
        mixes: { blend: { mix: ["lo"], by: "gone" } },
      }),
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
        clips: {
          lo: { channels: { "head.x": { keys: { "0": 0 } } } },
          hi: { channels: { "head.x": { keys: { "0": 10 } } } },
        },
        mixes: { blend: { mix: ["lo", "hi"], by: "w" } },
      },
      { controllers: { w: () => 0.5 } },
    ).anims["blend"]!;
    expect(() => scalar(0)).toThrow(/per-input weights, not a scalar/);
  });
});

describe("rig · controller declarations (self-describing inputs)", () => {
  it("throws when a mix names an undeclared controller", () => {
    expect(() =>
      rig(
        {
          controllers: { gazeX: { editor: { as: "coordinate" } } },
          clips: {
            lo: { channels: { "head.x": { keys: { "0": 0 } } } },
            hi: { channels: { "head.x": { keys: { "0": 10 } } } },
          },
          mixes: { blend: { mix: ["lo", "hi"], by: "w" } }, // `w` not declared
        },
        { controllers: { w: () => ({ lo: 1, hi: 0 }) } },
      ),
    ).toThrow(/not declared in `controllers`/);
  });

  it("throws on an unknown editor `as`", () => {
    expect(() => rig({ controllers: { c: { editor: { as: "wat" } as never } } })).toThrow(
      /unknown editor "as"/,
    );
  });

  it("throws on an unknown kind", () => {
    expect(() =>
      rig({ controllers: { c: { kind: "vector" as never, editor: { as: "clock" } } } }),
    ).toThrow(/unknown kind/);
  });

  it("throws when the host omits the source for a declared controller", () => {
    expect(() =>
      rig({
        clips: { a: { channels: { "eye.x": { keys: { "0": 0, "1": 10 } } } } },
        controllers: { gazeX: { editor: { as: "coordinate" }, clips: [{ clip: "a", offset: 1 }] } },
      }),
    ).toThrow(/no source supplied/);
  });
});
