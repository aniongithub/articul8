import { describe, expect, it } from "vitest";
import { sampleChannel } from "../src/channel.js";
import { project, makeCamera } from "../src/projection.js";
import { Spring } from "../src/spring.js";
import { parseRig, serializeRig, RigValidationError } from "../src/rig.js";
import { Skeleton } from "../src/skeleton.js";
import type { RigDocument } from "../src/rig.js";

describe("channel sampling", () => {
  it("returns fallback for empty channel", () => {
    expect(sampleChannel(undefined, 1, 7)).toBe(7);
  });
  it("holds a single keyframe as a constant", () => {
    expect(sampleChannel({ keyframes: [{ time: 0, value: 5 }] }, 99)).toBe(5);
  });
  it("interpolates linearly between keyframes", () => {
    const ch = { keyframes: [{ time: 0, value: 0 }, { time: 2, value: 10 }] };
    expect(sampleChannel(ch, 1)).toBeCloseTo(5);
  });
  it("clamps outside the keyframe range", () => {
    const ch = { keyframes: [{ time: 1, value: 3 }, { time: 2, value: 9 }] };
    expect(sampleChannel(ch, 0)).toBe(3);
    expect(sampleChannel(ch, 5)).toBe(9);
  });
  it("respects stepped curves", () => {
    const ch = {
      keyframes: [
        { time: 0, value: 0, curve: "stepped" as const },
        { time: 2, value: 10 },
      ],
    };
    expect(sampleChannel(ch, 1.9)).toBe(0);
  });
});

describe("projection", () => {
  it("scale is 1 at z=0", () => {
    const cam = makeCamera(600, { x: 0, y: 0 });
    expect(project(cam, 100, 0, 0).scale).toBeCloseTo(1);
  });
  it("foreshortens for z>0 and enlarges for z<0", () => {
    const cam = makeCamera(600, { x: 0, y: 0 });
    expect(project(cam, 0, 0, 100).scale).toBeLessThan(1);
    expect(project(cam, 0, 0, -100).scale).toBeGreaterThan(1);
  });
  it("shifts off-center points under depth (parallax)", () => {
    const cam = makeCamera(600, { x: 0, y: 0 });
    const near = project(cam, 100, 0, -100).x;
    const far = project(cam, 100, 0, 100).x;
    expect(near).toBeGreaterThan(far);
  });
});

describe("spring", () => {
  it("converges toward the target", () => {
    const s = new Spring(0, 20);
    for (let i = 0; i < 300; i++) s.step(10, 1 / 60);
    expect(s.current).toBeCloseTo(10, 1);
  });
});

const sampleRig: RigDocument = {
  version: 1,
  name: "unit",
  viewBox: [0, 0, 100, 100],
  skeleton: {
    bones: [
      { name: "root", local: { x: 50, y: 50 } },
      { name: "head", parent: "root", local: { y: -20, z: 0 }, inertia: 10 },
    ],
  },
  slots: [{ name: "face", bone: "head", attachment: "face", drawOrder: 0 }],
  attachments: { face: { type: "svgRegion", href: "#face" } },
  animations: [
    {
      name: "nod",
      additive: true,
      channels: [
        {
          target: { kind: "input", input: "look", property: "y" },
          data: { keyframes: [{ time: 0, value: 0 }, { time: 0.5, value: 1 }] },
        },
      ],
    },
  ],
  constraints: [
    { name: "aim", type: "lookAt", input: "look", writes: [{ bone: "head", from: "x", to: "yaw", gain: 30 }] },
  ],
  globals: { focalLength: 600, lookToZGain: 0.4 },
};

describe("rig document", () => {
  it("round-trips through serialize/parse", () => {
    const json = serializeRig(sampleRig);
    const back = parseRig(json);
    expect(back.name).toBe("unit");
    expect(back.skeleton.bones).toHaveLength(2);
  });
  it("rejects a bad version", () => {
    expect(() => parseRig(JSON.stringify({ ...sampleRig, version: 2 }))).toThrow(
      RigValidationError,
    );
  });
  it("rejects a slot referencing a missing bone", () => {
    const bad = { ...sampleRig, slots: [{ name: "x", bone: "ghost", drawOrder: 0 }] };
    expect(() => parseRig(JSON.stringify(bad))).toThrow(/missing bone/);
  });
});

describe("skeleton pipeline", () => {
  it("builds hierarchy and composes world transforms", () => {
    const sk = Skeleton.fromRig(sampleRig);
    sk.update(1 / 60);
    const head = sk.bones.get("head")!;
    // head world position = root(50,50) + local(0,-20)
    expect(head.world.tx).toBeCloseTo(50);
    expect(head.world.ty).toBeCloseTo(30);
  });

  it("lookAt constraint drives head yaw from input", () => {
    const sk = Skeleton.fromRig(sampleRig);
    sk.setInput("look", { x: 1, y: 0 });
    for (let i = 0; i < 240; i++) sk.update(1 / 60);
    const head = sk.bones.get("head")!;
    // yaw should trend toward yawGain (30) as the input spring settles
    expect(head.local.yaw).toBeGreaterThan(20);
  });
});
