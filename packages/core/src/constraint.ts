import type { BoneLocal } from "./bone.js";
import type { Skeleton } from "./skeleton.js";

/**
 * Constraints run after animation tracks and before world transform. The lookAt
 * constraint turns one summed look point into per-bone offsets via a generic
 * list of writes, so foreshorten (->z), parallax (->x/y), tilt (->rotation) and
 * aim (->yaw/pitch) all emerge from the same mechanism. Nobody authors "scale".
 */

export interface LookWrite {
  bone: string;
  /** which look axis drives this write */
  from: "x" | "y";
  /** which bone-local property receives it */
  to: keyof BoneLocal;
  /** value += look[from] * gain (sign selects direction / near-far) */
  gain: number;
}

export interface LookAtData {
  name: string;
  type: "lookAt";
  /** which input Vec3 to read (default "look") */
  input?: string;
  writes: LookWrite[];
}

export type ConstraintData = LookAtData;

export interface Constraint {
  readonly name: string;
  apply(skeleton: Skeleton): void;
}

export class LookAtConstraint implements Constraint {
  readonly name: string;
  constructor(private data: LookAtData) {
    this.name = data.name;
  }

  apply(skeleton: Skeleton): void {
    const look = skeleton.getInput(this.data.input ?? "look");
    for (const w of this.data.writes) {
      const bone = skeleton.bones.get(w.bone);
      if (!bone) continue;
      const src = w.from === "y" ? look.y : look.x;
      bone.local[w.to] += src * w.gain;
    }
  }
}

export function buildConstraint(data: ConstraintData): Constraint {
  switch (data.type) {
    case "lookAt":
      return new LookAtConstraint(data);
    default:
      throw new Error(`unknown constraint type: ${(data as { type: string }).type}`);
  }
}
