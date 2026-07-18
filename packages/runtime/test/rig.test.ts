import { describe, it, expect } from "vitest";
import { rig } from "../src/rig";

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
});
