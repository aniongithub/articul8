import { rig, clip, sampler, place, axis, mix, loop, clamp } from "@articul8/runtime";

const stage = document.querySelector<HTMLDivElement>("#stage")!;
const scrub = document.querySelector<HTMLInputElement>("#scrub")!;
const toggle = document.querySelector<HTMLButtonElement>("#toggle")!;
const clock = document.querySelector<HTMLSpanElement>("#clock")!;
const loveBtn = document.querySelector<HTMLButtonElement>("#love")!;

const [svg, data] = await Promise.all([
  fetch("cat.svg").then((r) => r.text()),
  fetch("cat.rig.json").then((r) => r.json()),
]);

const r = rig(data);
const view = r.bind(stage, svg);
const t = r.tracks;

/**
 * Three animations, each a lambda over one explicit variable. `blink` loops on
 * a raw millisecond clock; `lookX`/`lookY` are blendspaces placing a clip on
 * each side of centre, so a cursor coordinate in [-1, 1] samples the near side
 * and leaves the far one abstaining.
 */
const blink = place(sampler(clip(t.blink!), loop), { offset: 0, scale: 2000 });
const lookX = axis(
  place(clip(t.lookRight!), { offset: 0, scale: +1 }), // begins at 0, ends at +1
  place(clip(t.lookLeft!), { offset: 0, scale: -1 }), // begins at 0, ends at -1
);
const lookY = axis(
  place(clip(t.lookDown!), { offset: 0, scale: +1 }),
  place(clip(t.lookUp!), { offset: 0, scale: -1 }),
);

/**
 * The morph is *the same machinery* one channel wider: `clip(t.morph)` is an
 * anim whose pose carries each eye's whole shape, so a weight in [0, 1] tweens
 * eye→heart exactly like `lookX` tweens a bone. Here that weight is no slider
 * but a *reaction*: a click stamps `pop`, and `surge` reads the clock since then
 * as a half-sine bloom, so the eyes swell to hearts and settle back on their
 * own. The same scalar hushes the blink — the lids hold open while love is high.
 */
const heart = sampler(clip(t.morph!), clamp);
const openEyes = { "eyeR.sy": 1, "eyeL.sy": 1 };

const LOVE = 800; // one bloom-and-settle, in ms
let pop = -Infinity; // clock time of the last click; -∞ = at rest

/** A one-shot half-sine over `[pop, pop + LOVE]`: 0 → 1 → 0, then rest at 0. */
const surge = (ms: number): number => {
  const x = (ms - pop) / LOVE;
  return x <= 0 || x >= 1 ? 0 : Math.sin(Math.PI * x);
};

const unit = (v: number): number => (v < -1 ? -1 : v > 1 ? 1 : v);

let gazeX = 0;
let gazeY = 0;
let last = 0;

/**
 * The whole frame, as a pure function of the clock and the gaze. Folding a
 * time-driven track (`blink`) in with two variable-driven blendspaces
 * (`lookX`, `lookY`) is just one `mix` — layers over disjoint channels, so each
 * lands where it belongs and nothing fights.
 */
function render(ms: number): void {
  last = ms;
  const love = surge(ms);
  view.render(
    mix(
      [blink(ms), 1 - love],
      [openEyes, love],
      heart(love),
      lookX(gazeX),
      lookY(gazeY),
    ),
  );
  clock.textContent = `${Math.round(ms)} ms`;
}

stage.addEventListener("pointermove", (e) => {
  const b = stage.getBoundingClientRect();
  gazeX = unit(((e.clientX - b.left) / b.width) * 2 - 1);
  gazeY = unit(((e.clientY - b.top) / b.height) * 2 - 1);
  render(last);
});
stage.addEventListener("pointerleave", () => {
  gazeX = 0;
  gazeY = 0;
  render(last);
});
const react = (): void => {
  pop = last;
};
loveBtn.addEventListener("click", react);
stage.addEventListener("click", react);

let playing = true;
let raf = 0;
const start = performance.now();
const span = Number(scrub.max);

function frame(now: number): void {
  const ms = now - start;
  scrub.value = String(ms % span);
  render(ms);
  raf = requestAnimationFrame(frame);
}

function setPlaying(next: boolean): void {
  playing = next;
  toggle.dataset.playing = String(playing);
  toggle.setAttribute("aria-label", playing ? "Pause" : "Play");
  toggle.setAttribute("title", playing ? "Pause" : "Play");
  cancelAnimationFrame(raf);
  if (playing) raf = requestAnimationFrame(frame);
}

toggle.addEventListener("click", () => setPlaying(!playing));
scrub.addEventListener("input", () => {
  if (playing) setPlaying(false);
  render(Number(scrub.value));
});

setPlaying(true);
