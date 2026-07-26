import { describe, it, expect } from "vitest";
import { analyze } from "../src/analyze";

describe("analyze · structural model (the runtime read without binding)", () => {
  it("reports each clip channel's kind and slot", () => {
    const m = analyze({
      clips: {
        c: {
          channels: {
            "head.x": { keys: { "0": 0, "1": 10 } },
            wobble: { fn: "sine", amp: 3 },
          },
        },
      },
    });
    const c = m.nodes["c"]!;
    expect(c.kind).toBe("clip");
    expect(c.channels!["head.x"]).toMatchObject({ kind: "keys", slots: ["head.x"] });
    expect(c.channels!["wobble"]).toMatchObject({ kind: "fn", slots: ["wobble"] });
    expect([...c.slots].sort()).toEqual(["head.x", "wobble"]);
    expect(c.refs).toEqual([]);
  });

  it("a controller owns the union of its placed clips' slots and names them as refs", () => {
    const m = analyze({
      clips: {
        lo: { channels: { "head.x": { keys: { "0": 0 } }, "head.y": { keys: { "0": 0 } } } },
        hi: { channels: { "head.x": { keys: { "0": 10 } } } },
      },
      controllers: {
        gazeX: {
          editor: { as: "coordinate", range: [-1, 1] },
          clips: [
            { clip: "lo", offset: -1 },
            { clip: "hi", offset: 1 },
          ],
        },
      },
    });
    const g = m.nodes["gazeX"]!;
    expect(g.kind).toBe("controller");
    expect([...g.refs].sort()).toEqual(["hi", "lo"]);
    expect([...g.slots].sort()).toEqual(["head.x", "head.y"]); // union of lo ∪ hi
  });

  it("a mix node's slots are the union of its inputs and refs are the inputs", () => {
    const m = analyze({
      clips: {
        a: { channels: { "jaw.rotation": { keys: { "0": 0 } } } },
        b: { channels: { "ear.rotation": { keys: { "0": 0 } } } },
      },
      mixes: { blend: { mix: ["a", "b"], by: "w" } },
    });
    const node = m.nodes["blend"]!;
    expect(node.kind).toBe("mix");
    expect(node.by).toBe("w");
    expect(node.refs).toEqual(["a", "b"]);
    expect([...node.slots].sort()).toEqual(["ear.rotation", "jaw.rotation"]);
  });

  it("records every controller usage with its seam", () => {
    const m = analyze({
      clips: {
        lo: { channels: { "head.x": { keys: { "0": 0 } } } },
        hi: { channels: { "head.x": { keys: { "0": 10 } } } },
        beat: { channels: { "eye.sy": { keys: { "0": 1, "300": 0.2 } } } },
      },
      controllers: {
        heartClock: { editor: { as: "clock" }, clips: [{ clip: "beat", offset: 300 }] },
        gazeX: {
          editor: { as: "coordinate", range: [-1, 1] },
          clips: [
            { clip: "lo", offset: -1 },
            { clip: "hi", offset: 1 },
          ],
        },
      },
      mixes: { blend: { mix: ["lo", "hi"], by: "w" } },
    });
    const byUse = Object.fromEntries(m.usages.map((u) => [u.use, u]));
    expect(byUse["clock"]).toMatchObject({ name: "heartClock", node: "heartClock" });
    expect(byUse["coordinate"]).toMatchObject({ name: "gazeX", node: "gazeX" });
    expect(byUse["weights"]).toMatchObject({ name: "w", node: "blend" });
  });

  it("detects a reference cycle without throwing", () => {
    const m = analyze({
      mixes: {
        a: { mix: ["b"], by: "w" },
        b: { mix: ["a"], by: "w" },
      },
    });
    expect(m.cycles.length).toBeGreaterThan(0);
    expect([...m.cycles[0]!].sort()).toEqual(["a", "b"]);
  });

  it("leaves a dangling reference in refs with no slots, rather than throwing", () => {
    const m = analyze({
      mixes: { blend: { mix: ["ghost"], by: "w" } },
    });
    expect(m.nodes["blend"]!.refs).toEqual(["ghost"]);
    expect(m.nodes["blend"]!.slots).toEqual([]); // ghost contributes nothing
    expect(m.cycles).toEqual([]);
  });

  it("flags a soft role mismatch against a declaration, but not a matching use", () => {
    const m = analyze({
      controllers: {
        heartClock: { editor: { as: "clock", gate: "trigger" } },
        w: { editor: { as: "clock" } }, // declared a clock but read as weights below
      },
      clips: {
        lo: { channels: { "head.x": { keys: { "0": 0 } } } },
        hi: { channels: { "head.x": { keys: { "0": 10 } } } },
      },
      // reads `w` (declared clock) as a mix's weights — legal, but against the grain
      mixes: { blend: { mix: ["lo", "hi"], by: "w" } },
    });
    expect(m.diagnostics).toHaveLength(1);
    expect(m.diagnostics[0]).toMatchObject({ code: "role-mismatch", controller: "w", node: "blend" });
  });

  it("emits no diagnostics when there is no controllers block to check against", () => {
    const m = analyze({
      clips: {
        lo: { channels: { "head.x": { keys: { "0": 0 } } } },
        hi: { channels: { "head.x": { keys: { "0": 10 } } } },
      },
      mixes: { blend: { mix: ["lo", "hi"], by: "w" } },
    });
    expect(m.diagnostics).toEqual([]);
  });
});
