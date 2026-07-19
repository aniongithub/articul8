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
 * A named animation: a bag of channels over a shared span. `duration` is the
 * span's length, so a sample takes a normalised `u ∈ [0, 1]` — the beginning
 * of the track to its end, read like a texture coordinate.
 */
export interface Track {
  readonly duration: number;
  readonly channels: Readonly<Record<string, Channel>>;
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
 * Sample a whole track at `u ∈ [0, 1]` into a (sparse) pose. `u` spans the
 * track from start to end; anything outside simply abstains, so the caller's
 * chosen wrap (clamp, loop, pingpong) is the only thing that decides what a
 * `u` past the edges means.
 */
export function sample(track: Track, u: number): Pose {
  const t = u * track.duration;
  const pose: Pose = {};
  for (const c in track.channels) {
    const v = at(track.channels[c]!, t);
    if (v !== undefined) pose[c] = v;
  }
  return pose;
}
