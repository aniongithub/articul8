import { describe, it, expect } from "vitest";
import { analyze } from "../src/analyze";

describe("analyze · structural model (the runtime read without binding)", () => {
  it("reports each leaf channel's kind and slot", () => {
    const m = analyze({
      animations: {
        clip: {
          channels: {
            "head.x": { keys: { "0": 0, "1": 10 } },
            wobble: { fn: "sine", amp: 3 },
          },
        },
      },
    });
    const clip = m.nodes["clip"]!;
    expect(clip.kind).toBe("leaf");
    expect(clip.channels!["head.x"]).toMatchObject({ kind: "keys", slots: ["head.x"] });
    expect(clip.channels!["wobble"]).toMatchObject({ kind: "fn", slots: ["wobble"] });
    expect([...clip.slots].sort()).toEqual(["head.x", "wobble"]);
  });

  it("an axis channel owns the union of its children's slots and names them as refs", () => {
    const m = analyze({
      animations: {
        lo: { channels: { "head.x": { keys: { "0": 0 } }, "head.y": { keys: { "0": 0 } } } },
        hi: { channels: { "head.x": { keys: { "0": 10 } } } },
        gait: { channels: { g: { over: "x", keys: { "0": "lo", "1": "hi" } } } },
      },
    });
    const g = m.nodes["gait"]!.channels!["g"]!;
    expect(g.kind).toBe("axis");
    expect(g.over).toBe("x");
    expect(g.refs).toEqual(["lo", "hi"]);
    expect([...g.slots].sort()).toEqual(["head.x", "head.y"]); // union of lo ∪ hi
    expect([...m.nodes["gait"]!.refs].sort()).toEqual(["hi", "lo"]);
  });

  it("a mix node's slots are the union of its inputs and refs are the inputs", () => {
    const m = analyze({
      animations: {
        a: { channels: { "jaw.rotation": { keys: { "0": 0 } } } },
        b: { channels: { "ear.rotation": { keys: { "0": 0 } } } },
        blend: { mix: ["a", "b"], by: "w" },
      },
    });
    const node = m.nodes["blend"]!;
    expect(node.kind).toBe("mix");
    expect(node.by).toBe("w");
    expect(node.refs).toEqual(["a", "b"]);
    expect([...node.slots].sort()).toEqual(["ear.rotation", "jaw.rotation"]);
  });

  it("records every controller usage with its seam", () => {
    const m = analyze({
      animations: {
        lo: { channels: { "head.x": { keys: { "0": 0 } } } },
        hi: { channels: { "head.x": { keys: { "0": 10 } } } },
        beat: { controller: "clock", channels: { "eye.sy": { keys: { "0": 1, "300": 0.2 } } } },
        gait: { channels: { g: { over: "x", keys: { "0": "lo", "1": "hi" } } } },
        blend: { mix: ["lo", "hi"], by: "w" },
      },
    });
    const byUse = Object.fromEntries(m.usages.map((u) => [u.use, u]));
    expect(byUse["clock"]).toMatchObject({ name: "clock", node: "beat" });
    expect(byUse["coordinate"]).toMatchObject({ name: "x", node: "gait", channel: "g" });
    expect(byUse["weights"]).toMatchObject({ name: "w", node: "blend" });
  });

  it("detects a reference cycle without throwing", () => {
    const m = analyze({
      animations: {
        a: { channels: { g: { over: "x", keys: { "0": "b" } } } },
        b: { channels: { g: { over: "x", keys: { "0": "a" } } } },
      },
    });
    expect(m.cycles.length).toBeGreaterThan(0);
    expect([...m.cycles[0]!].sort()).toEqual(["a", "b"]);
  });

  it("leaves a dangling reference in refs with no slots, rather than throwing", () => {
    const m = analyze({
      animations: { gait: { channels: { g: { over: "x", keys: { "0": "ghost" } } } } },
    });
    expect(m.nodes["gait"]!.refs).toEqual(["ghost"]);
    expect(m.nodes["gait"]!.channels!["g"]!.slots).toEqual([]); // ghost contributes nothing
    expect(m.cycles).toEqual([]);
  });

  it("flags a soft role mismatch against a declaration, but not a matching use", () => {
    const m = analyze({
      controllers: {
        heartClock: { editor: { as: "clock", gate: "trigger" } },
        x: { editor: { as: "coordinate", range: [-1, 1] } },
      },
      animations: {
        lo: { channels: { "head.x": { keys: { "0": 0 } } } },
        hi: { channels: { "head.x": { keys: { "0": 10 } } } },
        // reads the clock as a coordinate — legal, but against the grain
        gait: { channels: { g: { over: "heartClock", keys: { "0": "lo", "1": "hi" } } } },
        // reads the coordinate as a coordinate — clean
        ok: { channels: { g: { over: "x", keys: { "0": "lo", "1": "hi" } } } },
      },
    });
    expect(m.diagnostics).toHaveLength(1);
    expect(m.diagnostics[0]).toMatchObject({ code: "role-mismatch", controller: "heartClock", node: "gait" });
  });

  it("emits no diagnostics when there is no controllers block to check against", () => {
    const m = analyze({
      animations: {
        lo: { channels: { "head.x": { keys: { "0": 0 } } } },
        hi: { channels: { "head.x": { keys: { "0": 10 } } } },
        gait: { channels: { g: { over: "x", keys: { "0": "lo", "1": "hi" } } } },
      },
    });
    expect(m.diagnostics).toEqual([]);
  });
});
