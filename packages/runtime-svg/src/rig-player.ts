import {
  Skeleton,
  parseRig,
  type RigDocument,
  type Vec3,
} from "@articul8/core";
import { SVGBackend } from "./svg-backend.js";

export interface RigPlayerOptions {
  /** start the animation loop immediately after load (default true) */
  autoplay?: boolean;
}

/**
 * The small ship-anywhere runtime: core + SVG backend + a loop.
 *   player.load(doc, art); player.setInput('look', {x,y}); player.play('blink').
 */
export class RigPlayer {
  skeleton: Skeleton | null = null;
  backend: SVGBackend | null = null;
  doc: RigDocument | null = null;

  private raf = 0;
  private last = 0;
  private running = false;
  private activeSkin: string | null = null;

  /** absolute wall-clock time the loop has advanced, seconds */
  time = 0;
  /** called after every tick (for editor readouts) */
  onTick?: (dt: number) => void;

  constructor(private container: HTMLElement, private options: RigPlayerOptions = {}) {}

  /** Build skeleton + backend from a validated rig doc and an art SVG fragment. */
  load(docInput: RigDocument | unknown, art = ""): void {
    const doc = parseRig(docInput);
    this.doc = doc;
    this.dispose(false);

    this.skeleton = Skeleton.fromRig(doc);
    this.backend = new SVGBackend(this.container, doc.viewBox);
    if (art) this.backend.setArt(art);

    const skin = doc.skins ? Object.keys(doc.skins)[0] ?? null : null;
    this.activeSkin = skin;
    this.skeleton.bindAttachments(
      this.backend.factory,
      doc.attachments,
      skin ? doc.skins![skin] : undefined,
    );
    this.tick(0);
    if (this.options.autoplay !== false) this.start();
  }

  /** Fetch a `.rig` (and optional art) by URL, then load. */
  async loadUrl(rigUrl: string, artUrl?: string): Promise<void> {
    const [rigText, artText] = await Promise.all([
      fetch(rigUrl).then((r) => r.text()),
      artUrl ? fetch(artUrl).then((r) => r.text()) : Promise.resolve(""),
    ]);
    this.load(JSON.parse(rigText), artText);
  }

  setInput(name: string, v: Partial<Vec3>): void {
    this.skeleton?.setInput(name, v);
  }

  play(name: string, opts: { loop?: boolean; weight?: number } = {}): void {
    this.skeleton?.play(name, opts);
  }

  stopAnimation(name?: string): void {
    this.skeleton?.stop(name);
  }

  setSkin(name: string): void {
    if (!this.skeleton || !this.backend || !this.doc?.skins?.[name]) return;
    this.activeSkin = name;
    this.backend.clear();
    this.skeleton.bindAttachments(this.backend.factory, this.doc.attachments, this.doc.skins[name]);
  }

  /** Advance the simulation and render one frame. */
  tick(dt: number): void {
    if (!this.skeleton || !this.backend) return;
    this.skeleton.update(dt);
    this.skeleton.render();
    const order = [...this.skeleton.slots]
      .sort((a, b) => a.drawOrder - b.drawOrder)
      .map((s) => s.name);
    this.backend.reorder(order);
    this.time += dt;
    this.onTick?.(dt);
  }

  /** Scrub all playing animations to absolute time `t` (seconds) and render one frame. */
  seek(t: number): void {
    if (!this.skeleton || !this.backend) return;
    this.skeleton.seek(t);
    this.skeleton.render();
    const order = [...this.skeleton.slots]
      .sort((a, b) => a.drawOrder - b.drawOrder)
      .map((s) => s.name);
    this.backend.reorder(order);
    this.time = t;
    this.onTick?.(0);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number): void => {
      if (!this.running) return;
      const dt = Math.min((now - this.last) / 1000, 0.05);
      this.last = now;
      this.tick(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  pause(): void {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  get isRunning(): boolean {
    return this.running;
  }

  dispose(removeSvg = true): void {
    this.pause();
    if (removeSvg) {
      this.backend?.dispose();
      this.backend = null;
      this.skeleton = null;
    }
  }
}
