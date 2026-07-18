import { type Mat, identity, mul, translate, rotate, scale } from "./matrix";
import { type Pose } from "./pose";

/**
 * A bone's rest transform, parent-relative. Every field defaults, so a rig
 * only writes what differs from identity. `position` is the joint itself —
 * the pivot rotation and scale turn about.
 */
export interface Bone {
  readonly parent?: string | null;
  readonly x?: number;
  readonly y?: number;
  readonly rotation?: number;
  readonly sx?: number;
  readonly sy?: number;
}

export type Skeleton = Readonly<Record<string, Bone>>;

/** The bone's five scalars: its rest value, each overridable by the pose. */
const resolve = (name: string, bone: Bone, pose: Pose) => ({
  x: pose[`${name}.x`] ?? bone.x ?? 0,
  y: pose[`${name}.y`] ?? bone.y ?? 0,
  rotation: pose[`${name}.rotation`] ?? bone.rotation ?? 0,
  sx: pose[`${name}.sx`] ?? bone.sx ?? 1,
  sy: pose[`${name}.sy`] ?? bone.sy ?? 1,
});

/** Local transform: move to the joint, then rotate and scale about it. */
const localOf = (b: ReturnType<typeof resolve>): Mat =>
  mul(translate(b.x, b.y), mul(rotate(b.rotation), scale(b.sx, b.sy)));

/**
 * World matrix for every bone under a pose. An empty pose gives the rest
 * pose; that is the whole trick behind bind == pose at t=rest.
 */
export function world(skeleton: Skeleton, pose: Pose): Record<string, Mat> {
  const out: Record<string, Mat> = {};
  const build = (name: string): Mat => {
    const cached = out[name];
    if (cached) return cached;
    const bone = skeleton[name]!;
    const parent = bone.parent ? build(bone.parent) : identity;
    return (out[name] = mul(parent, localOf(resolve(name, bone, pose))));
  };
  for (const name in skeleton) build(name);
  return out;
}
