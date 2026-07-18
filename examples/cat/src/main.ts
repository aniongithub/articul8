import { rig, clip, sampler, place, axis, mix, loop } from "@articul8/runtime";

const stage = document.querySelector<HTMLDivElement>("#stage")!;
const scrub = document.querySelector<HTMLInputElement>("#scrub")!;
const toggle = document.querySelector<HTMLButtonElement>("#toggle")!;
const clock = document.querySelector<HTMLSpanElement>("#clock")!;

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
  view.render(mix(blink(ms), lookX(gazeX), lookY(gazeY)));
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
  toggle.textContent = playing ? "Pause" : "Play";
  cancelAnimationFrame(raf);
  if (playing) raf = requestAnimationFrame(frame);
}

toggle.addEventListener("click", () => setPlaying(!playing));
scrub.addEventListener("input", () => {
  if (playing) setPlaying(false);
  render(Number(scrub.value));
});

setPlaying(true);
