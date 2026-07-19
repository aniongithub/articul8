import { type Pose, type Value } from "./pose";

/** One channel's keyframes: parallel, time-sorted arrays. */
export interface Channel {
  readonly times: readonly number[];
  readonly values: readonly Value[];
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
 * Sample one channel at an absolute time. Returns `undefined` when the time
 * falls outside the channel's keys — the channel then abstains from the blend
 * (no-vote), rather than holding its last value. Contribution requires a
 * bracket, always.
 */
const at = (ch: Channel, t: number): Value | undefined => {
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
  return span === 0 ? v0 : lerp(v0, v1, (t - t0) / span);
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
