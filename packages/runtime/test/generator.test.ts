import { describe, it, expect } from "vitest";
import { sine, noise, generators, type Knob } from "../src/generator";
import { rig } from "../src/rig";
import { sample } from "../src/track";

// A generator is a channel that computes its value instead of storing it. It
// wears the same four-knob envelope as every other, so a sine and a noise are
// tuned with one vocabulary — and, crucially, it is a *pure function of time*:
// the same clock always yields the same value, so scrubbing and replay match.
//
// A leaf's knobs are functions of time, so `c` wraps a constant as the trivial
// one; composition (a knob that is itself a wave or a key list) is exercised
// through the rig build path below, where an artist authors it as data.

const c = (v: number): Knob => () => v;

describe("generator · sine", () => {
  it("rides its bias and swings by its amplitude", () => {
    const s = sine({ bias: c(5), amp: c(2), freq: c(1) });
    expect(s(0)).toBeCloseTo(5); // sin 0 → bias
    expect(s(250)).toBeCloseTo(7); // quarter cycle (1 Hz) → bias + amp
    expect(s(750)).toBeCloseTo(3); // three-quarter cycle → bias - amp
  });

  it("reads freq as honest cycles per second", () => {
    const s = sine({ freq: c(2) }); // 2 Hz → one full cycle every 500 ms
    expect(s(0)).toBeCloseTo(0);
    expect(s(500)).toBeCloseTo(0);
    expect(s(125)).toBeCloseTo(1); // quarter of a 500 ms cycle → peak
  });

  it("phase slides the wave along in ms", () => {
    const a = sine({ freq: c(1) });
    const b = sine({ freq: c(1), phase: c(250) }); // shifted a quarter cycle earlier
    expect(b(0)).toBeCloseTo(a(250));
  });
});

describe("generator · noise", () => {
  it("is deterministic — the same time always yields the same value", () => {
    const n = noise({ amp: c(3), freq: c(5) });
    for (const t of [0, 17, 123.4, 999, 5000]) expect(n(t)).toBe(n(t));
  });

  it("stays within bias ± amp", () => {
    const n = noise({ bias: c(10), amp: c(2), freq: c(6) });
    for (let t = 0; t < 4000; t += 7) {
      expect(n(t)).toBeGreaterThanOrEqual(8 - 1e-9);
      expect(n(t)).toBeLessThanOrEqual(12 + 1e-9);
    }
  });

  it("wanders — it is not constant", () => {
    const n = noise({ amp: c(1), freq: c(4) });
    const vals = [0, 300, 600, 900, 1200].map(n);
    expect(new Set(vals.map((v) => v.toFixed(4))).size).toBeGreaterThan(1);
  });
});

describe("generator · rig channel", () => {
  const data = {
    bones: { nose: { x: 0, y: 5 } },
    skin: { nose: { "0": { "*": 1 } } },
    animation: {
      sniff: { channels: { "nose.y": { fn: "noise", bias: 5, amp: 1, freq: 4 } } },
    },
  };

  it("builds a generator-only track with a unit duration (clock passes through)", () => {
    const t = rig(data).tracks.sniff!;
    expect(t.duration).toBe(1);
    // sample(track, u) → t = u·1 = u, so the wave reads the raw clock.
    const n = noise({ bias: c(5), amp: c(1), freq: c(4) });
    expect(sample(t, 250)["nose.y"]).toBeCloseTo(n(250));
  });

  it("votes every frame — no bracket, so never abstains", () => {
    const t = rig(data).tracks.sniff!;
    for (const u of [-1000, 0, 12345]) expect(sample(t, u)["nose.y"]).not.toBeUndefined();
  });

  it("rejects an unknown generator name", () => {
    const bad = { animation: { s: { channels: { "nose.y": { fn: "wobble" } } } } };
    expect(() => rig(bad)).toThrow(/no generator/);
  });

  it("exposes its generators by name in the registry", () => {
    expect(Object.keys(generators).sort()).toEqual(["noise", "sine"]);
  });
});

// Composition: any knob may itself be a wave or a key list, read afresh every
// frame. There is no combinator node — a richer spec is the whole mechanism.
describe("generator · composition", () => {
  const build = (cd: object) => rig({ animation: { s: { channels: { x: cd } } } }).tracks.s!;
  const val = (cd: object, t: number) => sample(build(cd), t).x as number;

  it("modulates a knob with a keyframe list (bias tracks the keys, clamped)", () => {
    // amp 0, so the output *is* the bias — and the bias is an eased-linear ramp.
    const cd = { fn: "sine", amp: 0, bias: { keys: { "0": 0, "1000": 100 } } };
    expect(val(cd, 0)).toBeCloseTo(0);
    expect(val(cd, 500)).toBeCloseTo(50); // half-way along the ramp
    expect(val(cd, 1000)).toBeCloseTo(100);
    expect(val(cd, -500)).toBeCloseTo(0); // before the first key → clamped
    expect(val(cd, 5000)).toBeCloseTo(100); // past the last key → clamped
  });

  it("modulates amplitude with a key list (AM — the swing grows over time)", () => {
    // phase puts the sine at its peak on every whole second; amp ramps 0→10, so
    // the peak height rides the amp key list exactly.
    const cd = { fn: "sine", freq: 1, phase: 250, amp: { keys: { "0": 0, "1000": 10 } } };
    expect(val(cd, 0)).toBeCloseTo(0); // peak × amp(0)=0
    expect(val(cd, 1000)).toBeCloseTo(10); // peak × amp(1000)=10
  });

  it("modulates bias with a nested generator (additive layering — the sniff form)", () => {
    // 61 + 0.3·noise + 0.7·sin(...): a wave riding a slow noisy drift.
    const cd = { fn: "sine", amp: 0.7, freq: 1.2, bias: { fn: "noise", bias: 61, amp: 0.3, freq: 6 } };
    const tr = build(cd);
    for (let t = 0; t < 4000; t += 11) {
      const y = sample(tr, t).x as number;
      expect(y).toBeGreaterThanOrEqual(60 - 1e-9); // 61 − 0.3 − 0.7
      expect(y).toBeLessThanOrEqual(62 + 1e-9); // 61 + 0.3 + 0.7
    }
    // The nested noise genuinely alters the wave — it is not the bare sine.
    const bare = sine({ bias: c(61), amp: c(0.7), freq: c(1.2) });
    const drift = [0, 400, 900, 1700].map((t) => (sample(tr, t).x as number) - bare(t));
    expect(new Set(drift.map((d) => d.toFixed(5))).size).toBeGreaterThan(1);
  });

  it("stays deterministic through composition (scrub/replay identical)", () => {
    const cd = { fn: "sine", freq: 2, amp: { fn: "noise", bias: 1, amp: 0.5, freq: 3 } };
    const tr = build(cd);
    for (const t of [0, 37, 512.5, 3000]) expect(sample(tr, t).x).toBe(sample(tr, t).x);
  });

  it("a bare constant knob still works — composition subsumes the old form", () => {
    const cd = { fn: "sine", bias: 5, amp: 2, freq: 1 };
    expect(val(cd, 0)).toBeCloseTo(5);
    expect(val(cd, 250)).toBeCloseTo(7);
  });
});
