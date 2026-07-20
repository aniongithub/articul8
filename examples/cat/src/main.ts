import { rig, mix, parseRig } from "@articul8/runtime";

const stage = document.querySelector<HTMLDivElement>("#stage")!;
const scrub = document.querySelector<HTMLInputElement>("#scrub")!;
const toggle = document.querySelector<HTMLButtonElement>("#toggle")!;
const clock = document.querySelector<HTMLSpanElement>("#clock")!;
const loveBtn = document.querySelector<HTMLButtonElement>("#love")!;

const [svg, data] = await Promise.all([
  // The drawing and the rig. The rig is authored as JSONC (JSON + comments), so
  // we fetch it as text and hand it to parseRig, which strips the comments and
  // returns plain rig data. (Plain JSON would parse too — comments are the point.)
  fetch("cat.svg").then((r) => r.text()),
  fetch("cat.rig.jsonc").then((r) => r.text()).then(parseRig),
]);

/**
 * Controllers are the ONLY place live input enters the rig. Each is a plain
 * `t -> value` function the runtime calls while sampling; the rig's JSON names
 * which one it wants. Three of them here, of two different kinds — a clock and
 * two coordinates — but the map is uniform; only who reads a given entry differs.
 */
const BLOOM = 900; // duration of one eye -> heart -> eye bloom, in ms
let gazeX = 0; // cursor x, remapped to [-1, 1]; 0 = centred
let gazeY = 0; // cursor y, remapped to [-1, 1]; 0 = centred
let last = 0; // the most recent frame time, so events can re-render in place
let bloom = 0; // wall-clock ms when the last click happened
let bloomed = false; // has the cat been clicked yet?
const controllers = {
  // A CLOCK. The morph track names this for its clock. Before any click it
  // abstains (undefined) so the morph casts no vote and the eyes rest; after a
  // click it returns a click-relative ramp, which the track's "clamp" wrap trims
  // to a single [0, 1] play.
  heartClock: (t: number) => (bloomed ? (t - bloom) / BLOOM : undefined),
  // Two COORDINATES. Each returns a bare number in [-1, 1] — not a clock, not a
  // weight map — read by an axis channel of the `look` track to pick where along
  // its blendspace to sit. The whole cursor blend is just these two scalars.
  gazeX: (_t: number) => gazeX,
  gazeY: (_t: number) => gazeY,
};

const r = rig(data, { controllers });
const view = r.bind(stage, svg);
const a = r.anims;

/**
 * The rig hands every animation back as a ready-to-call lambda — leaf clip or
 * interior blend, all the same to us. We just pick the four we want to play. See
 * cat.rig.jsonc for what each one does; here they are only names we will fold.
 */
const blink = a.blink!; // eyelids squash shut and reopen, looping forever
const heart = a.morph!; // eyes bloom into hearts on click, then settle back
const sniff = a.sniff!; // nose drifts on a procedural sine + noise wave
const look = a.look!; // eyes track the cursor via two orthogonal axes (x, y)

const unit = (v: number): number => (v < -1 ? -1 : v > 1 ? 1 : v);

function render(ms: number): void {
  last = ms;
  // Fold the four animations into one pose. Each writes its own slots (lid
  // scale, eye shape + colour, nose offset, gaze offset), so none overrides
  // another and `mix` needs no weights — a blooming heart still blinks and
  // sniffs while the eyes keep tracking.
  view.render(mix(blink(ms), heart(ms), sniff(ms), look(ms)));
  clock.textContent = `${Math.round(ms)} ms`;
}

// Cursor -> gaze. Map the pointer's position within the stage to [-1, 1] on each
// axis and re-render the current frame. The controllers just read these; the
// `look` axes turn them into eye movement. `unit` clamps to the [-1, 1] range.
stage.addEventListener("pointermove", (e) => {
  const b = stage.getBoundingClientRect();
  gazeX = unit(((e.clientX - b.left) / b.width) * 2 - 1);
  gazeY = unit(((e.clientY - b.top) / b.height) * 2 - 1);
  render(last);
});
// Pointer gone -> recentre the gaze so the eyes return to rest.
stage.addEventListener("pointerleave", () => {
  gazeX = 0;
  gazeY = 0;
  render(last);
});
// A click (on the cat or the love button) triggers the heart bloom.
const react = (): void => {
  bloom = last; // stamp the bloom's origin at now; the heart's controller reads it
  bloomed = true;
  render(last);
};
loveBtn.addEventListener("click", react);
stage.addEventListener("click", react);

// The play loop. The runtime is immediate-mode and stateless — it retains no
// clock — so the host owns time: we track wall-clock ms since start and ask for
// a frame each rAF tick. The scrubber and pause button are just other clocks.
let playing = true;
let raf = 0;
const start = performance.now();
const span = Number(scrub.max); // scrubber length in ms; the loop wraps within it

function frame(now: number): void {
  const ms = now - start;
  scrub.value = String(ms % span); // keep the scrubber in sync while playing
  render(ms);
  raf = requestAnimationFrame(frame);
}

// Toggle between running the rAF loop and holding on the current frame.
function setPlaying(next: boolean): void {
  playing = next;
  toggle.dataset.playing = String(playing);
  toggle.setAttribute("aria-label", playing ? "Pause" : "Play");
  toggle.setAttribute("title", playing ? "Pause" : "Play");
  cancelAnimationFrame(raf);
  if (playing) raf = requestAnimationFrame(frame);
}

toggle.addEventListener("click", () => setPlaying(!playing));
// Dragging the scrubber pauses playback and renders that exact time — a manual
// clock in place of the rAF one, which is all "scrubbing" ever is.
scrub.addEventListener("input", () => {
  if (playing) setPlaying(false);
  render(Number(scrub.value));
});

setPlaying(true);
