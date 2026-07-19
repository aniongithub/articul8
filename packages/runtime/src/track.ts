import { type Pose, type Value } from "./pose";
import { linear, type Ease } from "./ease";
import { type Generator } from "./generator";

/**
 * A channel is one thing: a time turned into a value. It arrives at that value
 * one of two ways — from *stored* keyframes (parallel, time-sorted arrays, with
 * an optional easing per key bending the segment leaving it), or from a *pure
 * function* of time (`fn`, a procedural generator). Same seam, so everything
 * above — sampling, wrapping, placing, blending — is oblivious to which it is.
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
 * A coordinate remap in *absolute time*: given a time and the track's own extent
 * (its `duration`), return the time actually read. This is the missing half of a
 * finite key list's definition — what a time past its end means. A generator is
 * born infinite; a keyframe track is finite until a wrap completes it. It sits
 * beside `duration` on the track because the two belong together: the span, and
 * the rule beyond it.
 */
export type Wrap = (t: number, duration?: number) => number;

/** Transparent border: leave the time untouched, so a keyframe channel runs off
 *  its keys and abstains (no vote). The default edge — today's behaviour. */
export const hold: Wrap = (t) => t;

/** `CLAMP_TO_EDGE`: hold the nearest edge frame forever. */
export const clamp: Wrap = (t, d = 1) => (t < 0 ? 0 : t > d ? d : t);

/** `REPEAT`: tile the track end to end over its own span. */
export const loop: Wrap = (t, d = 1) => ((t % d) + d) % d;

/** `MIRRORED_REPEAT`: tile, flipping every other copy, so it never jumps. */
export const pingpong: Wrap = (t, d = 1) => {
  const x = loop(t, 2 * d);
  return x > d ? 2 * d - x : x;
};

/**
 * An impure leaf: a user closure bound at rig-build, how the outside world — the
 * mouse, a click, a spring — enters an otherwise pure graph without the runtime
 * ever seeing an event. `undefined` always means "abstain right now", and the
 * channels or inputs it drives cast no vote (blink/rest shows through), exactly
 * as a keyframe does past its edge. What a *present* value means is the socket's
 * business — provision is uniform, consumption varies:
 *   • a **coord** socket reads a `number`: the clock to sample a track at.
 *   • a **by** socket reads a `{ input → weight }` map: one fader per mix input.
 * The runtime can't tell any of these from a pure function; only the closure
 * reaches out. One `controllers` map holds them all; each socket narrows.
 */
export type Controller = (
  t: number,
) => number | Readonly<Record<string, number>> | undefined;

/**
 * A named animation: a bag of channels over a shared span, read in absolute
 * time. `duration` is the span's length; `wrap` says what a time beyond it means
 * (loop, clamp, …), defaulting to `hold` — abstain past the edges. `coord`, when
 * present, is a controller that *supplies the clock* for this track's keyframe
 * channels — the click-relative bloom, a scrubbed cursor — replacing the raw
 * time before `wrap` trims its edges; a generator channel ignores it and takes
 * the real clock, being infinite already. Together they make a keyframe track a
 * total `t → value`, exactly like a generator: the extent, and the rule past it.
 */
export interface Track {
  readonly duration: number;
  readonly channels: Readonly<Record<string, Channel>>;
  readonly wrap?: Wrap;
  readonly coord?: Controller;
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
 * Sample one channel at an absolute time. A `fn` channel just evaluates its
 * generator (always a vote). A keyframe channel returns `undefined` when the
 * time falls outside its keys — abstaining from the blend (no-vote) rather than
 * holding its last value. Contribution requires a bracket, always.
 *
 * Exported because a knob is nothing but a scalar channel: the generator layer
 * samples a keyframe-list knob through this very seam (clamping the time into
 * the bracket first, since a knob must always have a value to give).
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
 * Sample a whole track at an absolute time `t` into a (sparse) pose. A generator
 * channel takes the raw clock — it is already infinite and owns no span. Every
 * keyframe channel reads through the track's clock: its `coord` controller if
 * one is bound (which may abstain, returning `undefined`, so the whole track
 * casts no vote this frame), else `t` directly, then trimmed by `wrap` (so a
 * looping track tiles, a clamping one holds its edges). A channel that still
 * lands outside its keys abstains too, leaving that slot to whoever else votes.
 */
export function sample(track: Track, t: number): Pose {
  const wrap = track.wrap ?? hold;
  const pose: Pose = {};
  for (const c in track.channels) {
    const ch = track.channels[c]!;
    if (ch.fn) {
      const v = ch.fn(t); // a generator owns the clock: no coord, no wrap
      if (v !== undefined) pose[c] = v;
      continue;
    }
    const u = track.coord ? track.coord(t) : t;
    if (u === undefined) continue; // the controller has no clock now → abstain
    if (typeof u !== "number")
      // a coord socket wants a clock; a weights map named here is a wiring error.
      throw new Error("articul8: a track's coord controller must return a clock (number), not weights");
    const v = at(ch, wrap(u, track.duration));
    if (v !== undefined) pose[c] = v;
  }
  return pose;
}
