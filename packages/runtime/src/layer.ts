import { blend, type Pose } from "./pose";
import { sample, type Track } from "./track";

/**
 * An animation is a lambda: a coordinate `v` in, a pose out. `v` is read like a
 * texture coordinate — `0` is the beginning of the anim, `1` is its end — so a
 * pose is just a constant anim, and everything larger is built by placing and
 * blending these lambdas. The variable itself is always explicit: you thread it
 * in at the callsite, `blink(t)`, `lookX(x)`.
 */
export type Anim = (v: number) => Pose;

/**
 * A coordinate remap on `[0, 1]`: a texture wrap mode. It decides what a `v`
 * outside the unit span means before the anim ever reads it.
 */
export type Wrap = (v: number) => number;

/** Transparent border: leave `v` untouched, so anything outside `[0, 1]` runs
 * off the keys and the anim abstains (no vote). The default edge. */
export const hold: Wrap = (v) => v;

/** `CLAMP_TO_EDGE`: hold the nearest edge frame forever. */
export const clamp: Wrap = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** `REPEAT`: tile the anim end to end. */
export const loop: Wrap = (v) => ((v % 1) + 1) % 1;

/** `MIRRORED_REPEAT`: tile, flipping every other copy, so it never jumps. */
export const pingpong: Wrap = (v) => {
  const t = loop(v / 2) * 2;
  return t > 1 ? 2 - t : t;
};

/** Read a track as an animation over its own `[0, 1]` span. */
export const clip = (track: Track): Anim => (v) => sample(track, v);

/**
 * Wrap a clip's edges: how it behaves at and beyond `0` and `1`. This is the
 * *only* place edge behavior lives — placement is somebody else's job.
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
