/**
 * The timeline panel — a thin wrapper over `animation-timeline-js`. It renders a
 * clip's channels as a dope-sheet and reports playhead moves. It holds NO model
 * of its own: `setClip` projects a `ClipModel` into the control's rows, so the
 * timeline stays a pure view over the rig.
 *
 * The control paints on a canvas, so its colours can't inherit CSS — we read the
 * Metro tokens from the document and push them in (and again on theme change).
 * The channel names live in a sibling HTML outline so they get real Metro type.
 */
import { Timeline, TimelineKeyframeShape } from "animation-timeline-js";
import type {
  TimelineModel,
  TimelineOptions,
  TimelineRow,
  TimelineTimeChangedEvent,
} from "animation-timeline-js";
import type { ClipModel } from "./model";

const ROW_H = 30;
const ROW_GAP = 2;
const HEADER_H = 28;

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function themeOptions(): TimelineOptions {
  const accent = token("--accent");
  return {
    fillColor: token("--bg"),
    headerFillColor: token("--bg"),
    labelsColor: token("--fg-dim"),
    tickColor: token("--border"),
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
): TimelinePanel {
  const timeline = new Timeline({ id: canvasHost, ...themeOptions() });

  let scrub: (t: number) => void = () => {};
  timeline.onTimeChanged((e: TimelineTimeChangedEvent) => {
    if (e.source === "user") scrub(e.val);
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
      tag.textContent = row.kind === "fn" ? "wave" : "";

      el.append(name, tag);
      rowsHost.append(el);
    }
  }

  function toTimelineModel(model: ClipModel): TimelineModel {
    const rows: TimelineRow[] = model.rows.map((row) => ({
      keyframes: row.keys.map((k) => ({ val: k.pos })),
    }));
    // Keep at least one (empty) row so the control still draws its gauge.
    if (rows.length === 0) rows.push({ keyframes: [] });
    return { rows };
  }

  return {
    setClip(model) {
      renderRows(model);
      timeline.setModel(toTimelineModel(model));
      timeline.setTime(model.span[0]);
    },
    setTime(t) {
      timeline.setTime(t);
    },
    onScrub(cb) {
      scrub = cb;
    },
    refreshTheme() {
      timeline.setOptions(themeOptions());
    },
    dispose() {
      timeline.dispose();
    },
  };
}
