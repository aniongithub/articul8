/**
 * A pose is a sparse bag of scalar channel values, keyed by `"bone.property"`
 * (e.g. `"head.rotation"`). Sparse is the point: a channel that is absent is
 * not zero — it is simply unsaid, and someone downstream fills it in.
 */
export type Pose = Record<string, number>;

/**
 * The one mixing primitive in the whole system.
 *
 * Per channel, a weighted average — counting only the poses that actually
 * carry that channel. A pose that omits a channel does not vote on it: it
 * neither pulls the value toward zero nor toward rest, it just abstains. So a
 * one-channel `blink` can ride on top of a full-body `walk` and touch nothing
 * but the eyes. Channels that no pose carries are absent from the result and
 * fall through to the rest pose later.
 */
export function blend(poses: readonly Pose[], weights: readonly number[]): Pose {
  const sum: Pose = {};
  const total: Record<string, number> = {};
  poses.forEach((pose, i) => {
    const w = weights[i] ?? 0;
    for (const c in pose) {
      sum[c] = (sum[c] ?? 0) + w * pose[c]!;
      total[c] = (total[c] ?? 0) + w;
    }
  });
  const out: Pose = {};
  for (const c in sum) out[c] = sum[c]! / total[c]!;
  return out;
}
