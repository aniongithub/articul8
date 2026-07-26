import { describe, it, expect } from "vitest";
import { parseAttr } from "../src/attr";
import { sampleClip } from "../src/track";
import { rig } from "../src/rig";

// Paint is not a new subsystem either — it is the same channel again, its value
// read out of an attribute string by one codec and written back in that string's
// own shape. Colour is the lone value-shape rule; everything else is numbers in
// a literal template. A single scalar is just the one-number case.

describe("attr · codec (numbers in, string out)", () => {
  it("reads a lone scalar and writes it back", () => {
    const a = parseAttr("0.5");
    expect(a.nums).toEqual([0.5]);
    expect(a.render([0.75])).toBe("0.75");
  });

  it("keeps the literal template around a list of numbers", () => {
    const a = parseAttr("4 2 4");
    expect(a.nums).toEqual([4, 2, 4]);
    expect(a.render([1, 2, 3])).toBe("1 2 3");
  });

  it("canonicalises a hex colour to [r,g,b,a] and renders rgba", () => {
    const a = parseAttr("#e6394a");
    expect(a.nums).toEqual([230, 57, 74, 1]);
    expect(a.render([230, 57, 74, 1])).toBe("rgba(230, 57, 74, 1)");
  });

  it("expands a short hex and reads named colours", () => {
    expect(parseAttr("#0f0").nums).toEqual([0, 255, 0, 1]);
    expect(parseAttr("black").nums).toEqual([0, 0, 0, 1]);
    expect(parseAttr("none").nums).toEqual([0, 0, 0, 0]);
  });

  it("clamps and rounds channels when rendering a lerped colour", () => {
    const a = parseAttr("#000000");
    expect(a.render([115, 28.5, 37, 0.5])).toBe("rgba(115, 29, 37, 0.5)");
  });
});

describe("paint · a dotted channel drives an attribute", () => {
  // The eye carries no authored fill (default black); the channel supplies both
  // endpoints. It rides the same clip as the morph, so one weight paints both.
  const svg = `<svg><path id="eye" d="M0,0 L10,0 L5,10 Z"/></svg>`;
  const data = {
    clips: { m: { channels: { "eye.fill": { keys: { "0": "#000000", "1": "#e6394a" } } } } },
  };

  it("fills a numeric channel from the codec, keyed by weight", () => {
    const r = rig(data);
    r.bind(svg);
    const ch = r.clips.m!.channels["eye.fill"]!;
    expect(ch.times).toEqual([0, 1]);
    expect(ch.values).toEqual([
      [0, 0, 0, 1],
      [230, 57, 74, 1],
    ]);
  });

  it("paints the attribute at a sampled pose, midway between the ends", () => {
    const r = rig(data);
    const puppet = r.bind(svg);
    const mid = sampleClip(r.clips.m!, 0.5);
    expect(puppet.paint(mid).get(0)).toEqual({ fill: "rgba(115, 29, 37, 1)" });
  });

  it("abstains when the channel does not vote — nothing painted", () => {
    const puppet = rig(data).bind(svg);
    expect(puppet.paint({}).size).toBe(0);
  });
});

describe("paint · rest and references", () => {
  it("rests on the authored attribute when the channel omits key 0", () => {
    const svg = `<svg><path id="dot" fill="#ffffff" d="M0,0 L1,0"/></svg>`;
    const data = { clips: { m: { channels: { "dot.fill": { keys: { "1": "#000000" } } } } } };
    const r = rig(data);
    r.bind(svg);
    const ch = r.clips.m!.channels["dot.fill"]!;
    expect(ch.times).toEqual([0, 1]);
    expect(ch.values[0]).toEqual([255, 255, 255, 1]); // authored white becomes rest
  });

  it("throws when a channel omits key 0 with no authored value to rest on", () => {
    const svg = `<svg><path id="dot" d="M0,0 L1,0"/></svg>`;
    const data = { clips: { m: { channels: { "dot.fill": { keys: { "1": "#000000" } } } } } };
    expect(() => rig(data).bind(svg)).toThrow(/needs a key at 0/);
  });

  it("wears another object's same attribute when a key names it", () => {
    const svg = `<svg><path id="a" fill="#000000" d="M0,0 L1,0"/><path id="b" fill="#112233" d="M0,0 L1,0"/></svg>`;
    const data = { clips: { m: { channels: { "a.fill": { keys: { "1": "b" } } } } } };
    const r = rig(data);
    r.bind(svg);
    expect(r.clips.m!.channels["a.fill"]!.values[1]).toEqual([17, 34, 51, 1]);
  });
});
