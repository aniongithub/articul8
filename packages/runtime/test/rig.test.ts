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
    expect(sample(eased, 1)["head.x"]).toBe(10);
    expect(sample(eased, 0.5)["head.x"] as number).toBeLessThan(5); // eased below the linear 5
    expect(sample(plain, 0.5)["head.x"]).toBeCloseTo(5);
  });
});
