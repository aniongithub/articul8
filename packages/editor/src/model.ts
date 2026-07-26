/**
 * Pure clip → timeline-rows derivation. Given the parsed rig and one clip name,
 * produce the rows the dope-sheet draws — one per channel — with a keyframe per
 * stored key. This reads the same authored shapes the runtime binds, so the
 * timeline is a *view* over the rig, never a second model.
 *
 * v0 shows the atomic **clips** only: keyframe data and procedural waves. A clip
 * is canonical, self-contained motion — how it is *placed* on a coordinate is a
 * controller's business, edited on a different surface (a later slice). So there
 * is no axis/over/mix here: a row is either stored `keys` or a `fn` wave.
 *
 * The editable model is the parsed rig object (comments are for humans; edits may
 * reserialize). So a keyframe carries only a light locator — clip, channel, and
 * the original time-key string — enough to find and mutate its entry later.
 */
import type { RigData } from "@articul8/runtime";

/** Which authored shape a channel row came from — drives how it's drawn. */
export type RowKind = "keys" | "fn";

/** One keyframe as the timeline sees it: a position plus where it lives. */
export interface ClipKey {
  /** Horizontal position — the key's parameter (ms for a timed clip, or [0,1]). */
  readonly pos: number;
  /** The authored value at this key: a number, or a colour/shape name. */
  readonly value: number | string;
  /** Locator back into the rig object (for editing): the original key string. */
  readonly timeKey: string;
}

/** One channel of the clip, as a dope-sheet row. */
export interface ClipRow {
  readonly channel: string;
  readonly kind: RowKind;
  readonly keys: readonly ClipKey[];
  /** For a procedural (`fn`) row, the generator's name (`sine`/`noise`/`saccade`). */
  readonly fn?: string;
}

/** What horizontal units this clip's rows are measured in. */
export type ClipUnit = "ms" | "coord";

/** A clip resolved into drawable rows. */
export interface ClipModel {
  readonly clip: string;
  readonly unit: ClipUnit;
  readonly span: readonly [number, number];
  readonly rows: readonly ClipRow[];
}

/** The clip names a rig declares, in authored order. */
export function clipNames(data: RigData): string[] {
  return Object.keys(data.clips ?? {});
}

type AnyKeys = Readonly<Record<string, unknown>>;

function keyValue(raw: unknown): number | string {
  if (raw !== null && typeof raw === "object" && "value" in raw) {
    return (raw as { value: number | string }).value;
  }
  return raw as number | string;
}

function keysOf(keys: AnyKeys): ClipKey[] {
  return Object.keys(keys)
    .map((k) => ({ pos: Number(k), value: keyValue(keys[k]), timeKey: k }))
    .sort((a, b) => a.pos - b.pos);
}

function spanOf(rows: readonly ClipRow[], fallback: [number, number]): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const r of rows) {
    for (const k of r.keys) {
      if (k.pos < lo) lo = k.pos;
      if (k.pos > hi) hi = k.pos;
    }
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo === hi) return fallback;
  return [lo, hi];
}

/** Build the drawable model for one clip. Throws only if the clip is unknown. */
export function buildClipModel(data: RigData, clip: string): ClipModel {
  const node = data.clips?.[clip];
  if (!node) throw new Error(`articul8 editor: no clip "${clip}"`);

  const rows: ClipRow[] = [];
  let sawKeys = false;

  for (const [channel, ch] of Object.entries(node.channels)) {
    if ("keys" in ch) {
      sawKeys = true;
      rows.push({ channel, kind: "keys", keys: keysOf(ch.keys) });
    } else {
      // Procedural (`fn`) — a wave, no stored keys; drawn as a filled lane
      // tagged with the generator's name (`sine`/`noise`/`saccade`).
      rows.push({ channel, kind: "fn", keys: [], fn: ch.fn });
    }
  }

  // A clip with stored keys spans its own key range and is measured in those
  // units (ms for a timed clip, [0,1] for a canonical one — a clip past 1 is ms).
  // A wave-only clip has no keys, so preview it over a legible 2 s of wall time.
  if (sawKeys) {
    const span = spanOf(rows, [0, 1]);
    return { clip, unit: span[1] > 1 ? "ms" : "coord", span, rows };
  }
  return { clip, unit: "ms", span: [0, 2000], rows };
}
