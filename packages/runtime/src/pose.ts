/**
 * A channel's value. A scalar is the 1-D case; a vector is a flat geometry
 * `[x0, y0, x1, y1, …]` (a whole path's moved points). Everything the system
 * does to a value is affine — `sample` lerps two keys, `blend` weight-averages
 * many — and those are the same operation on a number or on a vector. A bone
 * angle is a 1-vector; a mouth is a 2N-vector. Nothing above the leaf cares.
 */
export type Value = number | readonly number[];

/**
 * A pose is a sparse bag of channel values, keyed by `"bone.property"` (a
 * scalar, e.g. `"head.rotation"`) or by an object's id/draw-index (a geometry
 * vector — a morph). Sparse is the point: a channel that is absent is not
 * zero — it is simply unsaid, and someone downstream fills it in.
 */
export type Pose = Record<string, Value>;

/**
 * The one mixing primitive in the whole system.
 *
 * Per channel, a weighted average — counting only the poses that actually
 * carry that channel. A pose that omits a channel does not vote on it: it
 * neither pulls the value toward zero nor toward rest, it just abstains. So a
 * one-channel `blink` can ride on top of a full-body `walk` and touch nothing
 * but the eyes. Channels that no pose carries are absent from the result and
 * fall through to the rest pose later. Scalars and vectors mix by the same
 * law, elementwise — a morph target voting 0.7 is just this average on points.
 */
export function blend(poses: readonly Pose[], weights: readonly number[]): Pose {
  const sum: Record<string, number | number[]> = {};
  const total: Record<string, number> = {};
  poses.forEach((pose, i) => {
    const w = weights[i] ?? 0;
    for (const c in pose) {
      const v = pose[c]!;
      total[c] = (total[c] ?? 0) + w;
      if (typeof v === "number") {
        const acc = sum[c];
        sum[c] = (typeof acc === "number" ? acc : 0) + w * v;
      } else {
        let acc = sum[c] as number[] | undefined;
        if (!Array.isArray(acc)) sum[c] = acc = new Array(v.length).fill(0);
        for (let k = 0; k < v.length; k++) acc[k] = acc[k]! + w * v[k]!;
      }
    }
  });
  const out: Pose = {};
  for (const c in sum) {
    const s = sum[c]!;
    const w = total[c]!;
    out[c] = typeof s === "number" ? s / w : s.map((x) => x / w);
  }
  return out;
}
