import { rig, mix } from "@articul8/runtime";

const stage = document.querySelector<HTMLDivElement>("#stage")!;
const scrub = document.querySelector<HTMLInputElement>("#scrub")!;
const toggle = document.querySelector<HTMLButtonElement>("#toggle")!;
const clock = document.querySelector<HTMLSpanElement>("#clock")!;
const loveBtn = document.querySelector<HTMLButtonElement>("#love")!;

const [svg, data] = await Promise.all([
  fetch("cat.svg").then((r) => r.text()),
  fetch("cat.rig.json").then((r) => r.json()),
]);

/**
 * The rig's live state and its one controller map — the only place external
 * events enter. `heartClock` is the heart track's clock: it abstains (returns
 * `undefined`) until the first click, so the morph channels cast no vote and the
 * eyes rest; a click stamps `bloom` and the closure hands back `(t - bloom) /
 * BLOOM`, a click-relative ramp the track's `"wrap": "clamp"` trims to one
 * [0, 1] play. `gaze` is the *other* kind of consumer: it returns not a clock
 * but a `{ input → weight }` map — one fader per input of the `lookAt` mix node —
 * turning the cursor into a five-way blend of held eye poses. `eyes` gets the
 * central weight `(1-|x|)(1-|y|)`, each direction its own half-axis push; the
 * keys are exactly the node's inputs, no scalar shorthand. One uniform map, two
 * sockets: a track names `heartClock` for its clock, `lookAt` names `gaze` for
 * its weights.
 */
const BLOOM = 900; // one eye→heart→eye round trip, in ms
let gazeX = 0;
let gazeY = 0;
let last = 0;
let bloom = 0;
let bloomed = false;
const controllers = {
  heartClock: (t: number) => (bloomed ? (t - bloom) / BLOOM : undefined),
  gaze: (_t: number) => ({
    eyes: (1 - Math.abs(gazeX)) * (1 - Math.abs(gazeY)),
    lookRight: Math.max(0, gazeX),
    lookLeft: Math.max(0, -gazeX),
    lookDown: Math.max(0, gazeY),
    lookUp: Math.max(0, -gazeY),
  }),
};

const r = rig(data, { controllers });
const view = r.bind(stage, svg);
const a = r.anims;

/**
 * Every animation is a node the rig hands back ready to call — a leaf clip or an
 * interior blend, uniform to the caller. `blink` loops on its own `"wrap": "loop"`
 * span; `sniff` is a procedural noise wave wandering the nose; `heart` is the
 * morph clip whose click-relative clock lives in `heartClock`. `lookAt` is a
 * `mix` node folding five held eye poses — a centre plus four deflected extremes —
 * by the `gaze` faders, so the whole cursor blendspace that used to be two
 * hand-built `axis`/`place` towers is now just data in the rig. Each writes its
 * own channels (lid scale, eye shape and colour, nose offset, gaze offset), so
 * none can override another; the one `mix` below folds them and a blooming heart
 * still blinks and sniffs while the eyes keep tracking.
 */
const blink = a.blink!;
const heart = a.morph!;
const sniff = a.sniff!;
const lookAt = a.lookAt!;

const unit = (v: number): number => (v < -1 ? -1 : v > 1 ? 1 : v);

function render(ms: number): void {
  last = ms;
  view.render(mix(blink(ms), heart(ms), sniff(ms), lookAt(ms)));
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
  bloom = last; // stamp the bloom's origin at now; the heart's controller reads it
  bloomed = true;
  render(last);
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
