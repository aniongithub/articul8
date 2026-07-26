import { blend, type Pose } from "./pose";
import { sampleClip, type Clip, type Wrap } from "./track";

/**
 * An animation is a lambda: a coordinate `v` in, a pose out. For a timed clip
 * `v` is the absolute clock (ms); for a blendspace it is a spatial parameter (a
 * gaze in `[-1, 1]`). Either way a pose is just a constant anim, and everything
 * larger is built by placing and blending these lambdas. The variable itself is
 * always explicit: you thread it in at the callsite, `blink(t)`, `lookX(x)`.
 */
export type Anim = (v: number) => Pose;

/**
 * The wrap now lives with the track — it is the track's own edge rule, spoken in
 * absolute time — but the placement/blend vocabulary re-exports it so a caller
 * composing by hand keeps one import.
 */
export { hold, clamp, loop, pingpong, type Wrap } from "./track";

/** Read a clip as an animation, sampled at the parameter it is handed —
 *  threaded straight through the clip's own wrap. The one bridge from data to
 *  Anim. */
export const clip = (c: Clip): Anim => (u) => sampleClip(c, u);

/**
 * Re-wrap a clip at the callsite — an *ad-hoc* edge rule layered over whatever
 * the track already declares. The track's JSON `wrap` is the sensible default;
 * this is for the rarer case where the same track loops in one place and clamps
 * in another. It maps the coordinate before the clip reads it (period 1).
 */
export const sampler = (anim: Anim, wrap: Wrap): Anim => (v) => anim(wrap(v));

/**
 * Place a clip on the input variable. `offset` is the input value where the
 * clip *begins* (`u = 0`); it *ends* (`u = 1`) at `offset + scale`, so the sign
 * of `scale` is what mirrors a clip onto the negative side of centre. This is
 * the *only* thing that touches the input coordinate — everything else blends.
 */
export const place = (
  anim: Anim,
  { offset, scale }: { readonly offset: number; readonly scale: number },
): Anim => (v) => anim((v - offset) / scale);

/** A thing, or a thing paired with a blend weight. Weight defaults to 1. */
type Weighted<T> = T | readonly [T, number];
const split = <T>(x: Weighted<T>): readonly [T, number] =>
  Array.isArray(x) ? (x as readonly [T, number]) : [x as T, 1];

/**
 * A blendspace: several placed animations sharing one input variable. Hand each
 * child the same value; a child whose placement doesn't reach it runs off its
 * keys and abstains (empty pose), while the ones it lands inside return poses
 * that get blended by weight. So sliding the variable samples whichever
 * animations overlap it — one alone passes straight through, two or more
 * crossfade. An axis is itself an anim, so it nests inside a `place` or another
 * `axis` unchanged.
 */
export const axis =
  (...children: Weighted<Anim>[]): Anim =>
  (v) => {
    const pairs = children.map(split);
    return blend(pairs.map(([a]) => a(v)), pairs.map(([, w]) => w));
  };

/**
 * Blend already-sampled poses — the terminal combinator. Mirrors `axis` one
 * level down the currency: poses in (each the pose where some axis landed), one
 * pose out.
 */
export const mix = (...parts: Weighted<Pose>[]): Pose => {
  const pairs = parts.map(split);
  return blend(pairs.map(([p]) => p), pairs.map(([, w]) => w));
};
