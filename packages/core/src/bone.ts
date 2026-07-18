import { type Mat2D, matFromTRS, matIdentity, matMul } from "./math.js";

/** Setup-pose local transform of a bone. z/yaw/pitch are the 2.5D extension. */
export interface BoneLocal {
  x: number;
  y: number;
  z: number;
  /** in-plane rotation, degrees */
  rotation: number;
  /** 2.5D aim, degrees — consumed by lookAt/foreshorten, not by the 2D compose */
  yaw: number;
  pitch: number;
  sx: number;
  sy: number;
}

export interface BoneData {
  name: string;
  /** parent bone name, or null for a root bone */
  parent?: string | null;
  local: Partial<BoneLocal>;
  /** per-bone spring stiffness (higher = snappier). undefined = no spring. */
  inertia?: number;
}

export function defaultLocal(): BoneLocal {
  return { x: 0, y: 0, z: 0, rotation: 0, yaw: 0, pitch: 0, sx: 1, sy: 1 };
}

/**
 * Runtime bone. `setup` is the immutable rest pose; `local` is the working pose
 * reset to setup each frame, then modified by tracks + constraints.
 */
export class Bone {
  readonly name: string;
  parent: Bone | null = null;
  readonly children: Bone[] = [];

  readonly setup: BoneLocal;
  local: BoneLocal;

  world: Mat2D = matIdentity();
  /** accumulated depth down the chain, fed to projection */
  worldZ = 0;

  inertia: number | undefined;

  constructor(data: BoneData) {
    this.name = data.name;
    this.setup = { ...defaultLocal(), ...data.local };
    this.local = { ...this.setup };
    this.inertia = data.inertia;
  }

  /** Reset working pose to the rest pose (step 1 of the update pipeline). */
  resetToSetup(): void {
    this.local = { ...this.setup };
  }

  /** Compose world transform from parent (step 4). */
  updateWorld(): void {
    const l = this.local;
    const localMat = matFromTRS(l.x, l.y, l.rotation, l.sx, l.sy);
    if (this.parent) {
      this.world = matMul(this.parent.world, localMat);
      this.worldZ = this.parent.worldZ + l.z;
    } else {
      this.world = localMat;
      this.worldZ = l.z;
    }
  }
}
