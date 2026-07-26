/**
 * The timeline panel — a thin wrapper over `@articul8/timeline`. It renders a
 * clip's channels as a dope-sheet and reports playhead moves. It holds NO model
 * of its own: `setClip` projects a `ClipModel` into the control's rows, so the
 * timeline stays a pure view over the rig.
 *
 * The control paints on a canvas, so its colours can't inherit CSS — we read the
 * Metro tokens from the document and push them in (and again on theme change).
 * The channel names live in a sibling HTML outline so they get real Metro type.
 */
import { Timeline, TimelineKeyframeShape } from "@articul8/timeline";
import type {
  TimelineModel,
  TimelineOptions,
  TimelineRow,
  TimelineTimeChangedEvent,
} from "@articul8/timeline";
import type { ClipModel } from "./model";

/** Samples one procedural channel of a clip at a local parameter (the runtime's
 *  pure generator). Supplied by the stage so the sparkline traces the real
 *  signal the puppet moves by. */
export type ChannelSampler = (clip: string, channel: string, t: number) => number | undefined;

const ROW_H = 30;
const ROW_GAP = 2;
const HEADER_H = 28;
const FIT_MARGIN = 48; // px reserved for the gauge's left margin + right breathing room
const STEP_PX = 120; // px between gauge major ticks (drives tick density, not the fit)

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function themeOptions(): TimelineOptions {
  const accent = token("--accent");
  return {
    fillColor: token("--bg"),
    headerFillColor: token("--bg"),
    labelsColor: token("--fg-muted"),
    tickColor: token("--fg-dim"),
    selectionColor: accent,
    headerHeight: HEADER_H,
    snapEnabled: false,
    font: '11px Inter, "Segoe UI", sans-serif',
    timelineStyle: { strokeColor: accent, capStyle: { fillColor: accent, strokeColor: accent } },
    rowsStyle: {
      height: ROW_H,
      marginBottom: ROW_GAP,
      fillColor: token("--tile-bg"),
      keyframesStyle: {
        shape: TimelineKeyframeShape.Rect,
        fillColor: accent,
        strokeColor: accent,
        selectedFillColor: token("--fg"),
      },
    },
  };
}

export interface TimelinePanel {
  setClip(model: ClipModel): void;
  setTime(t: number): void;
  onScrub(cb: (t: number) => void): void;
  refreshTheme(): void;
  dispose(): void;
}

/** Mount the dope-sheet into `canvasHost`, with channel names in `rowsHost`. */
export function mountTimeline(
  canvasHost: HTMLElement,
  rowsHost: HTMLElement,
  sample: ChannelSampler,
): TimelinePanel {
  const timeline = new Timeline({ id: canvasHost, ...themeOptions() });

  let scrub: (t: number) => void = () => {};
  let current: ClipModel | null = null;
  timeline.onTimeChanged((e: TimelineTimeChangedEvent) => {
    if (e.source !== "user") return;
    // Clamp the user's scrub to the clip's span. A procedural channel is defined
    // past the span, but the span is the region playback loops over, so we don't
    // let the playhead leave it. Pin the control's own playhead to the bound when
    // the drag overshoots so it visibly stops at the edge instead of floating on.
    let t = e.val;
    if (current) {
      const [lo, hi] = current.span;
      const c = t < lo ? lo : t > hi ? hi : t;
      if (c !== t) {
        t = c;
        timeline.setTime(t);
      }
    }
    scrub(t);
  });

  function renderRows(model: ClipModel): void {
    rowsHost.replaceChildren();

    if (model.rows.length === 0) {
      const empty = document.createElement("div");
      empty.className = "tl-outline-empty";
      empty.textContent = "no channels";
      rowsHost.append(empty);
      return;
    }

    for (const row of model.rows) {
      const el = document.createElement("div");
      el.className = "tl-outline-row";
      el.style.height = `${ROW_H}px`;
      el.style.marginBottom = `${ROW_GAP}px`;

      const name = document.createElement("span");
      name.className = "tl-outline-name";
      name.textContent = row.channel;

      const tag = document.createElement("span");
      tag.className = "tl-outline-tag";
      // A procedural lane is tagged with its generator's real name (`sine`/
      // `saccade`/`noise`), not a lossy blanket "wave".
      tag.textContent = row.kind === "fn" ? (row.fn ?? "fn") : "";

      el.append(name, tag);
      rowsHost.append(el);
    }
  }

  // Auto-range a curve's amplitude by sampling its whole span once. A generator
  // rests on `bias±amp`, but either knob may itself be modulated, so we take the
  // signal's own extremes rather than trusting declared knobs — and range over
  // the FULL span (not the visible sub-window) so the trace doesn't breathe as
  // the user zooms or scrolls. A flat/absent signal falls back to a unit band.
  function curveDomain(clip: string, channel: string, span: readonly [number, number]): [number, number] {
    const [a, b] = span;
    const N = 512;
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i <= N; i++) {
      const v = sample(clip, channel, a + ((b - a) * i) / N);
      if (typeof v !== "number" || !Number.isFinite(v)) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (lo === Infinity || lo === hi) {
      const c = lo === Infinity ? 0 : lo;
      return [c - 1, c + 1];
    }
    const pad = (hi - lo) * 0.08; // a little headroom so peaks don't kiss the edge
    return [lo - pad, hi + pad];
  }

  function toTimelineModel(model: ClipModel): TimelineModel {
    // A procedural (`fn`) lane has no stored keyframes. It is drawn as two layers:
    //   1. a blue *band* bounded to the clip's domain, so the lane reads as an
    //      active computed channel that hard-starts at the span's origin (never
    //      bleeding into the pre-roll); and
    //   2. a *sparkline* — the generator sampled and traced across that band, the
    //      same pure signal the runtime moves the puppet by.
    //
    // The band can't be a per-row `style.fillColor` (the control fills the whole
    // scroll width), so it is a *group* bounded to `[span0, span1]`: two boundary
    // keyframes sharing one group make the control paint a rounded band between
    // them. The boundary keyframes are invisible (`height: 0` collapses the
    // square) and non-interactive — the band is the mark, not the dots. The
    // sparkline rides on the control's own `curve` capability, which samples it
    // across the visible window using the control's transform (zoom/scroll free).
    const fnFill = token("--tl-fn-fill");
    const fnLine = token("--accent");
    const [span0, span1] = model.span;
    const rows: TimelineRow[] = model.rows.map((row) => {
      if (row.kind === "fn") {
        const [min, max] = curveDomain(model.clip, row.channel, model.span);
        return {
          keyframesDraggable: false,
          groupsDraggable: false,
          style: {
            groupsStyle: { fillColor: fnFill, radii: 0 },
            keyframesStyle: { height: 0, width: 0 },
          },
          keyframes: [
            { val: span0, group: "fn", draggable: false },
            { val: span1, group: "fn", draggable: false },
          ],
          curve: {
            sample: (t: number) => sample(model.clip, row.channel, t),
            min,
            max,
            domainStart: span0,
            domainEnd: span1,
            color: fnLine,
            fillAlpha: 0.22,
          },
        };
      }
      return { keyframes: row.keys.map((k) => ({ val: k.pos })) };
    });
    // Keep at least one (empty) row so the control still draws its gauge.
    if (rows.length === 0) rows.push({ keyframes: [] });
    return { rows };
  }

  // Fit the clip's full span to the canvas width. The control maps a value to a
  // pixel by `px = val * stepPx / stepVal` (zoom 1), so its fixed default scale
  // (0.12 px/unit) crushes a canonical [0,1] clip's two keys into one dot while
  // spreading a ms clip fine. We keep stepPx at its modest default (so the gauge
  // still lays out ~one major tick per stepPx, with legible subdivisions) and fit
  // via stepVal = STEP_PX * len / usable — giving px/unit = usable/len, so *any*
  // clip fills the same width with its keyframes and ticks both legible.
  function fitOptions(model: ClipModel): TimelineOptions {
    const len = Math.max(1e-6, model.span[1] - model.span[0]);
    const width = canvasHost.clientWidth || 600;
    const usable = Math.max(240, width - FIT_MARGIN);
    return { stepPx: STEP_PX, stepVal: (STEP_PX * len) / usable };
  }

  // Push scale + colours together. Colours are re-read from the live CSS tokens
  // every time, so the gauge tick/label colours are asserted on every redraw —
  // not just at construction (when the tokens may not have resolved yet, which is
  // why ticks previously stayed invisible until a manual theme toggle).
  function applyOptions(model: ClipModel): void {
    timeline.setOptions({ ...themeOptions(), ...fitOptions(model) });
  }

  // Re-fit whenever the canvas host changes size. A ResizeObserver fires once
  // when observation begins and again when layout settles the real width — that
  // second call is what makes the gauge ticks appear on first paint (before it,
  // the canvas has a degenerate width and the control skips tick rendering).
  // It also handles window/splitter resizes, keeping the clip's span filling the
  // width. We refit only after a real width lands to avoid thrashing on 0-size.
  let lastWidth = 0;
  const refit = (): void => {
    const w = canvasHost.clientWidth;
    if (w <= 0 || !current) return;
    if (w === lastWidth) return;
    lastWidth = w;
    applyOptions(current);
  };
  const ro = new ResizeObserver(refit);
  ro.observe(canvasHost);

  return {
    setClip(model) {
      current = model;
      renderRows(model);
      applyOptions(model);
      timeline.setModel(toTimelineModel(model));
      timeline.setTime(model.span[0]);
      // Belt-and-suspenders: re-assert scale + colours after layout and the
      // control's own internal rescale have settled (both run on rAF). This is
      // exactly what a manual theme toggle does — doing it automatically means
      // the gauge ticks paint on first load without one.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (current === model) applyOptions(model);
        }),
      );
    },
    setTime(t) {
      timeline.setTime(t);
    },
    onScrub(cb) {
      scrub = cb;
    },
    refreshTheme() {
      timeline.setOptions(themeOptions());
      // The fn-lane fill is carried on the model (per-row style), so re-project
      // the current clip to pick up the new theme's `--tl-fn-fill`, preserving
      // the playhead position.
      if (current) {
        const t = timeline.getTime();
        timeline.setModel(toTimelineModel(current));
        timeline.setTime(t);
      }
    },
    dispose() {
      ro.disconnect();
      timeline.dispose();
    },
  };
}
