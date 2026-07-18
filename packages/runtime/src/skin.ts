import { apply, invert, mul, type Mat } from "./matrix";
import { type Pose } from "./pose";
import { world, type Skeleton } from "./skeleton";
import { buildPath, parsePath, type ParsedPath, type Pt } from "./path";

/**
 * Who moves what, and how much. Read as
 * `bone -> object -> (point index | "*") -> weight`.
 * The object is a path's draw-order index (a number) or its id. `"*"` weights
 * every point not named explicitly. Weights are normalised per point at bind.
 */
export type SkinMap = Record<string, Record<string, Record<string, number>>>;

interface Bound {
  readonly path: ParsedPath;
  readonly rest: Pt[];
  readonly influences: { readonly bone: string; readonly w: number }[][];
}

/** A bound skin: hand it a pose, get back each object's new `d` string. */
export interface Skin {
  pose(pose: Pose): Map<number, string>;
}

const influencesFor = (
  path: ParsedPath,
  byBone: Record<string, Record<string, number>>,
): Bound["influences"] => {
  const per = path.points.map(() => [] as { bone: string; w: number }[]);
  for (const bone in byBone) {
    const spec = byBone[bone]!;
    const star = spec["*"];
    per.forEach((list, i) => {
      const w = spec[String(i)] ?? star;
      if (w) list.push({ bone, w });
    });
  }
  for (const list of per) {
    const total = list.reduce((a, e) => a + e.w, 0);
    if (total > 0) for (const e of list) e.w /= total;
  }
  return per;
};

/**
 * Bind a skeleton to a set of objects. Linear blend skinning: at bind we
 * capture each bone's rest world matrix and each point's rest position; to
 * pose, a point rides the weighted sum of `world · restWorld⁻¹` over its
 * bones. Unbound objects never appear in the output and so stay put.
 */
export function bindSkin(
  skeleton: Skeleton,
  skin: SkinMap,
  objects: readonly ParsedPath[],
  ids: Readonly<Record<string, number>> = {},
): Skin {
  const index = (key: string): number => {
    const i = /^\d+$/.test(key) ? Number(key) : ids[key];
    if (i === undefined || !objects[i]) throw new Error(`articul8: unknown skin object "${key}"`);
    return i;
  };

  const byObject = new Map<number, Record<string, Record<string, number>>>();
  for (const bone in skin) {
    for (const key in skin[bone]!) {
      const i = index(key);
      const group = byObject.get(i) ?? {};
      group[bone] = skin[bone]![key]!;
      byObject.set(i, group);
    }
  }

  const bound = new Map<number, Bound>();
  for (const [i, byBone] of byObject) {
    const path = objects[i]!;
    bound.set(i, {
      path,
      rest: path.points.map((p) => ({ x: p.x, y: p.y })),
      influences: influencesFor(path, byBone),
    });
  }

  const restWorld = world(skeleton, {});
  const restInverse: Record<string, Mat> = {};
  for (const b in restWorld) restInverse[b] = invert(restWorld[b]!);

  return {
    pose(pose: Pose): Map<number, string> {
      const now = world(skeleton, pose);
      const delta: Record<string, Mat> = {};
      for (const b in now) delta[b] = mul(now[b]!, restInverse[b]!);

      const out = new Map<number, string>();
      for (const [i, b] of bound) {
        b.path.points.forEach((pt, k) => {
          const rest = b.rest[k]!;
          const inf = b.influences[k]!;
          let x = 0;
          let y = 0;
          if (inf.length === 0) {
            x = rest.x;
            y = rest.y;
          } else {
            for (const { bone, w } of inf) {
              const [tx, ty] = apply(delta[bone]!, rest.x, rest.y);
              x += w * tx;
              y += w * ty;
            }
          }
          pt.x = x;
          pt.y = y;
        });
        out.set(i, buildPath(b.path.segs));
      }
      return out;
    },
  };
}
