import { type Pose, type Value } from "./pose";
import { linear, type Ease } from "./ease";
import { type Generator } from "./generator";

/**
 * A channel is one thing: a coordinate turned into a value. It arrives at that
 * value one of two ways — from *stored* keyframes (parallel, sorted arrays, with
 * an optional easing per key bending the segment leaving it), or from a *pure
 * function* (`fn`, a procedural generator). Same seam, so everything above —
 * sampling, wrapping, placing, blending — is oblivious to which it is.
 *
 * A `fn` channel votes every frame (a wave has no edges); a keyframe channel
 * abstains outside its bracket. When `fn` is present the keyframe arrays are
 * ignored, so a generator carries empty ones.
 */
export interface Channel {
  readonly times: readonly number[];
  readonly values: readonly Value[];
  readonly eases?: readonly Ease[];
  readonly fn?: Generator;
}

/**
 * A coordinate remap in a clip's own parameter: given a parameter and the clip's
 * own extent (its `span`), return the parameter actually read. This is the
 * missing half of a finite key list's definition — what a parameter past its end
 * means. A generator is born infinite; a keyframe clip is finite until a wrap
 * completes it. Wrap is intrinsic to the clip: a loop clip loops no matter who
 * reads it.
 */
export type Wrap = (t: number, span?: number) => number;

/** Transparent border: leave the parameter untouched, so a keyframe channel runs
 *  off its keys and abstains (no vote). The default edge. */
export const hold: Wrap = (t) => t;

/** `CLAMP_TO_EDGE`: hold the nearest edge frame forever. */
export const clamp: Wrap = (t, d = 1) => (t < 0 ? 0 : t > d ? d : t);

/** `REPEAT`: tile the clip end to end over its own span. */
export const loop: Wrap = (t, d = 1) => ((t % d) + d) % d;

/** `MIRRORED_REPEAT`: tile, flipping every other copy, so it never jumps. */
export const pingpong: Wrap = (t, d = 1) => {
  const x = loop(t, 2 * d);
  return x > d ? 2 * d - x : x;
};

/**
 * An impure leaf: a host closure bound at rig-build, how the outside world — the
 * mouse, a click, a spring — enters an otherwise pure graph without the runtime
 * ever seeing an event. `undefined` always means "abstain right now", and the
 * clips or inputs it drives cast no vote (rest shows through), exactly as a
 * keyframe does past its edge. What a *present* value means is the reader's
 * business — provision is uniform, consumption varies:
 *   • a **coordinate** controller reads a `number`: where along its ruler to sit.
 *   • a **weights** socket (`mix`/`by`) reads a `{ input → weight }` map.
 * The runtime can't tell any of these from a pure function; only the closure
 * reaches out. One `controllers` map (host side) holds the bodies; each reader
 * narrows.
 */
export type Source = (
  t: number,
) => number | Readonly<Record<string, number>> | undefined;

/**
 * A clip: atomic keyframe data. A bag of channels read over a shared parameter,
 * plus a `wrap` that says what a parameter beyond the clip's `span` means (loop,
 * clamp, …), defaulting to `hold` — abstain past the edges. A clip knows nothing
 * about clocks, coordinates, ranges, or who samples it: it is a pure
 * `parameter → Pose`. A controller (elsewhere) is what places a clip on a
 * coordinate and feeds it that parameter; here the clip only folds and reads.
 */
export interface Clip {
  readonly channels: Readonly<Record<string, Channel>>;
  readonly wrap?: Wrap;
  /** The clip's own extent — the last key across its channels — the period a
   *  loop/clamp/pingpong wrap is measured against. Computed at build. */
  readonly span: number;
}

/**
 * Interpolate between two keyframe values. Scalars and vectors follow the same
 * affine law — a straight lerp on a number, or elementwise on a geometry — so
 * a shape key tweens exactly like a bone angle, one branch deep and no deeper.
 */
const lerp = (a: Value, b: Value, f: number): Value =>
  typeof a === "number" && typeof b === "number"
    ? a + (b - a) * f
    : (a as readonly number[]).map((av, k) => av + ((b as readonly number[])[k]! - av) * f);

/**
 * Sample one channel at a parameter. A `fn` channel just evaluates its generator
 * (always a vote). A keyframe channel returns `undefined` when the parameter
 * falls outside its keys — abstaining from the blend (no-vote) rather than
 * holding its last value. Contribution requires a bracket, always.
 *
 * Exported because a knob is nothing but a scalar channel: the generator layer
 * samples a keyframe-list knob through this very seam (clamping the parameter
 * into the bracket first, since a knob must always have a value to give).
 */
export const at = (ch: Channel, t: number): Value | undefined => {
  if (ch.fn) return ch.fn(t);
  const { times, values } = ch;
  const n = times.length;
  if (n === 0 || t < times[0]! || t > times[n - 1]!) return undefined;
  let i = 0;
  while (i < n - 1 && times[i + 1]! < t) i++;
  const t0 = times[i]!;
  const t1 = times[i + 1] ?? t0;
  const v0 = values[i]!;
  const v1 = values[i + 1] ?? v0;
  const span = t1 - t0;
  if (span === 0) return v0;
  const ease = ch.eases?.[i] ?? linear;
  return lerp(v0, v1, ease((t - t0) / span));
};

/**
 * Sample a whole clip at a parameter `u` into a (sparse) pose. A generator
 * channel takes `u` raw — it is already infinite and owns no span. Every
 * keyframe channel reads `u` trimmed by the clip's `wrap` (so a looping clip
 * tiles, a clamping one holds its edges); a channel that still lands outside its
 * keys abstains, leaving that slot to whoever else votes.
 */
export function sampleClip(clip: Clip, u: number): Pose {
  const wrap = clip.wrap ?? hold;
  const pose: Pose = {};
  for (const c in clip.channels) {
    const ch = clip.channels[c]!;
    if (ch.fn) {
      const v = ch.fn(u); // a generator owns its parameter: no wrap
      if (v !== undefined) pose[c] = v;
      continue;
    }
    const v = at(ch, wrap(u, clip.span));
    if (v !== undefined) pose[c] = v;
  }
  return pose;
}
