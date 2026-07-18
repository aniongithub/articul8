import { clamp, lerp } from "./math.js";

/**
 * The one primitive: a channel is a keyframed scalar sampled over time.
 * Everything animatable (bone.z, slot.morph.closed, rig.focalLength) is a channel.
 */

export type CurveType = "linear" | "stepped" | "smooth";

export interface Keyframe {
  /** time in seconds */
  time: number;
  value: number;
  /** interpolation from THIS keyframe to the next; default "linear" */
  curve?: CurveType;
}

export interface ChannelData {
  keyframes: Keyframe[];
}

/** Cubic smoothstep easing for "smooth" curves. */
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Sample a channel at time `t`. Constants are single-keyframe channels.
 * An empty channel returns `fallback`.
 */
export function sampleChannel(
  ch: ChannelData | undefined,
  t: number,
  fallback = 0,
): number {
  if (!ch || ch.keyframes.length === 0) return fallback;
  const kfs = ch.keyframes;
  if (kfs.length === 1) return kfs[0]!.value;

  // Before first / after last: clamp to ends.
  if (t <= kfs[0]!.time) return kfs[0]!.value;
  const last = kfs[kfs.length - 1]!;
  if (t >= last.time) return last.value;

  // Find the surrounding keyframes (linear scan; timelines are small).
  let i = 0;
  while (i < kfs.length - 1 && kfs[i + 1]!.time <= t) i++;
  const a = kfs[i]!;
  const b = kfs[i + 1]!;
  const span = b.time - a.time;
  const raw = span <= 0 ? 0 : clamp((t - a.time) / span, 0, 1);

  switch (a.curve ?? "linear") {
    case "stepped":
      return a.value;
    case "smooth":
      return lerp(a.value, b.value, smoothstep(raw));
    case "linear":
    default:
      return lerp(a.value, b.value, raw);
  }
}

/** Duration (time of last keyframe) of a channel. */
export function channelDuration(ch: ChannelData | undefined): number {
  if (!ch || ch.keyframes.length === 0) return 0;
  return ch.keyframes[ch.keyframes.length - 1]!.time;
}
