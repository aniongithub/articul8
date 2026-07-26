import "./style.css";
import { initTheme } from "./theme";
import { data, source } from "./rig-source";
import { buildClipModel, clipNames, type ClipModel } from "./model";
import { mountStage } from "./stage";
import { mountTimeline } from "./timeline-panel";

/**
 * The editor as a lens. One clip is soloed at a time: a pivot picks it, the
 * stage shows the live puppet, and the timeline is the hero — a dope-sheet of
 * that clip's channels with a scrubbable playhead. The playhead stands in for
 * whatever the clip reads (a clock, an axis coordinate), so scrubbing blooms a
 * morph or sweeps a blendspace exactly as the runtime would.
 *
 * Auto-play maps a fixed 2 s wall-clock phase onto the clip's span, so clips in
 * ms, coordinate, or normalized units all preview at a legible pace.
 */
const theme = initTheme(document.getElementById("theme"));

const stage = mountStage(
  document.getElementById("stage")!,
  data,
  source.svgText,
);
const timeline = mountTimeline(
  document.getElementById("tl-canvas")!,
  document.getElementById("tl-outline-rows")!,
);

const clipSelect = document.getElementById("clip-select") as HTMLSelectElement;
const playBtn = document.getElementById("play") as HTMLButtonElement;
const timeEl = document.getElementById("time")!;
const statusEl = document.getElementById("status")!;

const CYCLE_MS = 2000; // wall-clock time to traverse any clip's full span once

let model: ClipModel | null = null;
let playing = false;
let phaseBase = performance.now(); // wall time mapped to span start

/** Reset every stand-in controller to its declared rest before soloing a clip. */
function restAll(): void {
  for (const name of Object.keys(stage.drive)) stage.drive[name] = stage.rest(name);
}

function lerpSpan(span: readonly [number, number], phase: number): number {
  return span[0] + (span[1] - span[0]) * phase;
}

/** Paint the puppet + move the playhead for local time `t` within the clip. */
function renderAt(t: number): void {
  if (!model) return;
  stage.showClip(model.clip, t);
  timeline.setTime(t);
  timeEl.textContent = model.unit === "ms" ? `${Math.round(t)} ms` : t.toFixed(2);
}

function selectClip(name: string): void {
  model = buildClipModel(data, name);
  restAll();
  timeline.setClip(model);
  phaseBase = performance.now();
  if (clipSelect.value !== name) clipSelect.value = name;
  statusEl.textContent = `${name} · ${model.rows.length} ch`;
  renderAt(model.span[0]);
}

function buildPicker(): void {
  for (const name of clipNames(data)) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    clipSelect.append(opt);
  }
  clipSelect.addEventListener("change", () => selectClip(clipSelect.value));
}

function setPlaying(next: boolean): void {
  playing = next;
  playBtn.dataset.playing = String(next);
  playBtn.setAttribute("aria-label", next ? "Pause" : "Play");
  playBtn.title = next ? "Pause" : "Play";
  if (next) phaseBase = performance.now();
}

// Scrubbing on the timeline is a manual clock: pause auto-play and follow it.
timeline.onScrub((t) => {
  if (playing) setPlaying(false);
  renderAt(t);
});

playBtn.addEventListener("click", () => setPlaying(!playing));

// Canvas colours don't inherit CSS, so re-push Metro tokens on theme change.
theme.onChange(() => timeline.refreshTheme());

function frame(now: number): void {
  if (playing && model) {
    const phase = ((now - phaseBase) % CYCLE_MS) / CYCLE_MS;
    renderAt(lerpSpan(model.span, phase));
  }
  requestAnimationFrame(frame);
}

buildPicker();
const first = clipNames(data)[0];
if (first) selectClip(first);
requestAnimationFrame(frame);
