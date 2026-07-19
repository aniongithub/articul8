/**
 * An easing is nothing but a reparam of the unit interval: `[0, 1] → [0, 1]`,
 * fixing both ends. `sample` already reduces every segment to a fraction `f`
 * between two keys; feeding `f` through an easing before the lerp bends the
 * *timing* of the tween without touching the values, so a shape, a scalar and a
 * colour all bend by the same curve.
 *
 * The one true curve is the cubic Bézier — the timing function CSS and every
 * animation editor draw. Its two control points are *independent*: the first
 * bends the departure, the second the arrival. So "ease in" and "ease out" are
 * not two mechanisms but the two *handles* of one, which is exactly why a
 * keyframe carries an outgoing handle (how it leaves) and an incoming handle
 * (how the next key is reached). A segment is one Bézier: the left key's `out`
 * handle meets the right key's `in` handle. Omit them and both handles fall on
 * the diagonal, where the Bézier is the straight line — piecewise linear, the
 * absence of easing made explicit.
 */
export type Ease = (f: number) => number;

/** A cubic-Bézier control point in the unit square — one keyframe handle. */
export type Handle = readonly [x: number, y: number];

export const linear: Ease = (f) => f;

/**
 * A cubic-Bézier timing function through `(0,0)` and `(1,1)` with control
 * points `(x1,y1)`, `(x2,y2)`. The curve is parametric in its own `t`, so to
 * read `y` at a given `x = f` we invert `x(t)` by a few Newton steps — its
 * slope is well-behaved on `[0,1]` — then evaluate `y(t)` there.
 */
export const bezier = (x1: number, y1: number, x2: number, y2: number): Ease => {
  if (x1 === y1 && x2 === y2) return linear; // control points on the diagonal
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const x = (t: number): number => ((ax * t + bx) * t + cx) * t;
  const dx = (t: number): number => (3 * ax * t + 2 * bx) * t + cx;
  const y = (t: number): number => ((ay * t + by) * t + cy) * t;
  return (f) => {
    if (f <= 0) return 0;
    if (f >= 1) return 1;
    let t = f;
    for (let i = 0; i < 8; i++) {
      const e = x(t) - f;
      if (Math.abs(e) < 1e-6) break;
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    return y(t < 0 ? 0 : t > 1 ? 1 : t);
  };
};

// Default handles sit on the diagonal, so a key with no easing is linear.
const OUT: Handle = [1 / 3, 1 / 3];
const IN: Handle = [2 / 3, 2 / 3];

/**
 * The easing of the segment *leaving* a key: that key's outgoing handle meets
 * the next key's incoming handle to form one Bézier. Either handle absent falls
 * back to the diagonal, so a missing handle simply straightens its own side.
 */
export const segment = (out: Handle | undefined, next: Handle | undefined): Ease => {
  const o = out ?? OUT;
  const i = next ?? IN;
  return bezier(o[0], o[1], i[0], i[1]);
};
