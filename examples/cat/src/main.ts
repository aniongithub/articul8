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
 * which one it wants and which clips it places. Four of them here — a clock, two
 * coordinates, and one that returns not a coordinate but a WEIGHT MAP (lookBlend,
 * which drives the `look` mix). The map is uniform; only what each returns differs.
 */
let cursorX = 0; // cursor x, remapped to [-1, 1]; 0 = centred. NOT eye geometry —
let cursorY = 0; // just the coordinate the gaze controllers read and place clips on.
let last = 0; // the most recent frame time, so events can re-render in place
let bloom = 0; // wall-clock ms when the last click happened
let bloomed = false; // has the cat been clicked yet?
let inside = false; // is the pointer currently over the SVG?
let k = 0; // eased gaze blend: 0 = wander freely, 1 = track the cursor
const controllers = {
  // A CLOCK. The bloom clip owns its own timing (900 ms of ms-keyed motion), so we
  // just hand the heartClock controller the RAW click-relative time (t - bloom) and
  // it plays the clip straight through (offset 1, no time-scaling). Before any click
  // it abstains (undefined) so the bloom casts no vote and the eyes rest; after a
  // click it plays once, the clip's "clamp" wrap holding the ends.
  heartClock: (t: number) => (bloomed ? t - bloom : undefined),
  // The coordinate sources, bound to the gaze controller names the rig declares.
  // Each just hands back where the cursor sits on its [-1, 1] ruler — a bare scalar,
  // nothing eye-shaped. The gazeX/gazeY controllers in the rig turn that coordinate
  // into eye motion by PLACING their clips (gazeLeft at offset -1, gazeRight at +1,
  // etc.) and blending; the host never touches eye.x.
  gazeX: (_t: number) => cursorX,
  gazeY: (_t: number) => cursorY,
  // A WEIGHTS controller — the `look` mix's `by`. It returns one weight per input
  // (wander, gazeX, gazeY), not a coordinate. `k` eases toward 1 while the pointer
  // is inside the SVG and back to 0 when it leaves, so the eyes crossfade from idle
  // wander to cursor tracking. Per eye slot the weights total 1 (wander + the one
  // gaze axis that owns it), so the blend is always well-formed.
  lookBlend: (_t: number) => ({ wander: 1 - k, gazeX: k, gazeY: k }),
};

const r = rig(data, { controllers });
const view = r.bind(stage, svg);
const a = r.anims;

/**
 * The rig hands every playable node back as a ready-to-call lambda — a leaf clip
 * read directly, or a controller that places its clips on a coordinate. We pick
 * the ones we want to fold. See cat.rig.jsonc for what each does; here they are
 * only names.
 */
const blink = a.blink!; // eyelids squash shut and reopen, looping forever (wall time)
const sniff = a.sniff!; // nose drifts on a procedural sine + noise wave
const heart = a.heartClock!; // eyes bloom into hearts on click, then settle back
const look = a.look!; // the gaze mix: idle wander crossfading into cursor tracking

const unit = (v: number): number => (v < -1 ? -1 : v > 1 ? 1 : v);

function render(ms: number): void {
  last = ms;
  // Fold the animations into one pose. Each writes its own slots (lid scale, eye
  // shape + colour, nose offset, and the two eye axes the `look` mix owns), so none
  // overrides another and the top-level `mix` needs no weights — a blooming heart
  // still blinks and sniffs while the eyes wander or track.
  view.render(mix(blink(ms), heart(ms), sniff(ms), look(ms)));
  clock.textContent = `${Math.round(ms)} ms`;
}

// Cursor -> coordinate. Map the pointer's position within the stage to [-1, 1] on
// each axis and re-render. We only set the COORDINATE here; the gazeX/gazeY
// controllers read it and the `look` mix folds it against the wander by `k`.
// `unit` clamps to [-1, 1].
stage.addEventListener("pointermove", (e) => {
  const b = stage.getBoundingClientRect();
  cursorX = unit(((e.clientX - b.left) / b.width) * 2 - 1);
  cursorY = unit(((e.clientY - b.top) / b.height) * 2 - 1);
  render(last);
});
// Pointer in/out just flips `inside`; the frame loop eases `k` toward it, so the
// eyes hand off between wander and tracking smoothly. No recentring — when the
// pointer leaves, `k` falls to 0 and the wander takes over on its own.
stage.addEventListener("pointerenter", () => {
  inside = true;
});
stage.addEventListener("pointerleave", () => {
  inside = false;
});
// A click (on the cat or the love button) triggers the heart bloom.
const react = (): void => {
  bloom = last; // stamp the bloom's origin at now; heartClock reads it as t - bloom
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
  // Ease the gaze blend toward wherever the pointer is: 1 while inside the SVG,
  // 0 once it leaves. This exponential approach is the whole wander<->track handoff.
  k += ((inside ? 1 : 0) - k) * 0.12;
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
