import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { RigPlayer } from "../src/index.js";

// The generic sample shipped with the editor is our end-to-end fixture: it must
// load through core + the SVG backend and render every visible slot.
// cwd is packages/runtime-svg when vitest runs this workspace.
const samples = resolve(process.cwd(), "../../editor/public/samples");
const rig = JSON.parse(readFileSync(resolve(samples, "mascot.rig.json"), "utf8"));
const art = readFileSync(resolve(samples, "mascot.svg"), "utf8");

describe("RigPlayer + sample mascot", () => {
  it("loads the rig and renders one SVG element per visible slot", () => {
    const host = document.createElement("div");
    const player = new RigPlayer(host, { autoplay: false });
    player.load(rig, art);

    const svg = host.querySelector("svg");
    expect(svg).toBeTruthy();
    const layer = svg!.querySelector(".articul8-layer")!;
    expect(layer.childNodes.length).toBe(rig.slots.length);
  });

  it("responds to look input by moving the head and foreshortening antennae", () => {
    const host = document.createElement("div");
    const player = new RigPlayer(host, { autoplay: false });
    player.load(rig, art);
    const sk = player.skeleton!;

    // settle at rest
    for (let i = 0; i < 120; i++) player.tick(1 / 60);
    const restHeadRot = sk.bones.get("head")!.local.rotation;

    // look hard right, let springs settle
    player.setInput("look", { x: 1, y: 0 });
    for (let i = 0; i < 240; i++) player.tick(1 / 60);

    const head = sk.bones.get("head")!;
    const zL = sk.bones.get("antennaL")!.local.z;
    const zR = sk.bones.get("antennaR")!.local.z;

    // head tilts (rotation gain is negative for look.x)
    expect(head.local.rotation).toBeLessThan(restHeadRot - 3);
    // antennae foreshorten oppositely (one recedes, one approaches)
    expect(Math.sign(zL)).toBe(-Math.sign(zR));
    expect(Math.abs(zL)).toBeGreaterThan(10);
  });

  it("plays the additive idle animation without exploding", () => {
    const host = document.createElement("div");
    const player = new RigPlayer(host, { autoplay: false });
    player.load(rig, art);
    player.play("idle", { loop: true });
    for (let i = 0; i < 300; i++) player.tick(1 / 60);
    const transforms = player.skeleton!.render();
    for (const t of transforms) {
      expect(Number.isFinite(t.x)).toBe(true);
      expect(Number.isFinite(t.y)).toBe(true);
      expect(Number.isFinite(t.scale)).toBe(true);
    }
  });

  it("blends a morph target (blink) on the eye mesh", () => {
    const host = document.createElement("div");
    const player = new RigPlayer(host, { autoplay: false });
    player.load(rig, art);
    const eye = player.skeleton!.slots.find((s) => s.name === "eyeL")!;
    player.play("blink");
    // t≈0.1s the eye is fully closed (blink weight 1)
    for (let i = 0; i < 6; i++) player.tick(1 / 60);
    expect(eye.morph.blink).toBeGreaterThan(0.5);
  });
});
