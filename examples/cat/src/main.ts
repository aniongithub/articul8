import { rig, clip, place, axis, mix } from "@articul8/runtime";

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
 * Three animations, each a lambda over one explicit variable. `blink` is a bare
 * clip read straight on the millisecond clock — it loops because its *track*
 * declares `"wrap": "loop"` in the rig, tiling its own 2000 ms span, so nothing
 * here maps time by hand. `lookX`/`lookY` are blendspaces placing a clip on each
 * side of centre, so a cursor coordinate in [-1, 1] samples the near side and
 * leaves the far one abstaining.
 */
const blink = clip(t.blink!);
const lookX = axis(
  place(clip(t.lookRight!), { offset: 0, scale: +1 }), // begins at 0, ends at +1
  place(clip(t.lookLeft!), { offset: 0, scale: -1 }), // begins at 0, ends at -1
);
const lookY = axis(
  place(clip(t.lookDown!), { offset: 0, scale: +1 }),
  place(clip(t.lookUp!), { offset: 0, scale: -1 }),
);

/**
 * The morph is *the same machinery* as the blink, placed on the same clock —
 * only relative to the click instead of the origin. `blink` loops on its own
 * span; `heart` is the morph clip placed at the last click, and its track
 * declares `"wrap": "clamp"`, so it holds the resting eye until a click moves
 * its origin to *now* and it plays through once over `BLOOM` ms. That move is
 * all the click does — `place` maps `ms → [0, 1]` exactly as it does for a
 * blendspace, so no clip time is computed by hand. The bloom's whole shape — its
 * easing, its colour — is in the clip. And because `blink` writes `eye.sy` while
 * `heart` writes `eye`/`eye.fill`, both fold into the one `mix` below and a
 * blooming heart still blinks.
 */
const morph = clip(t.morph!);
const BLOOM = 900; // one eye→heart→eye round trip, in ms
let heart = place(morph, { offset: -Infinity, scale: BLOOM }); // at rest: clamped open

/**
 * The sniff is a *procedural* channel, not a keyframe one — its `nose.y` is a
 * noise wave generated straight from the clock. `clip` reads it exactly like any
 * track; a generator owns no span and bypasses the wrap, so `sniff(ms)` passes
 * the raw clock through and the wave reads absolute time. It wanders the nose up
 * and down forever, no trigger, no state.
 */
const sniff = clip(t.sniff!);

const unit = (v: number): number => (v < -1 ? -1 : v > 1 ? 1 : v);

let gazeX = 0;
let gazeY = 0;
let last = 0;

/**
 * The whole frame, as a pure function of the clock and the gaze: the blink, the
 * heart, the sniff, and the two gaze blendspaces all voting into one `mix`, each
 * placed on its own input. Each writes its own channels — lid scale, eye shape
 * and colour, nose offset, gaze offset — so none can override another; they just
 * compose. A blooming heart still blinks, and the nose sniffs throughout.
 */
function render(ms: number): void {
  last = ms;
  view.render(mix(blink(ms), heart(ms), sniff(ms), lookX(gazeX), lookY(gazeY)));
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
  heart = place(morph, { offset: last, scale: BLOOM }); // move the origin to now
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
