import { Animation, type AnimationData } from "./animation.js";
import type { AttachmentData, AttachmentFactory, SlotTransform } from "./attachment.js";
import { Bone, type BoneData } from "./bone.js";
import { type Camera, makeCamera, project } from "./projection.js";
import { type Constraint, type ConstraintData, buildConstraint } from "./constraint.js";
import type { RigDocument } from "./rig.js";
import { Slot, type SlotData } from "./slot.js";
import { Spring } from "./spring.js";
import { type Vec3, vec3 } from "./math.js";

export interface SkeletonData {
  bones: BoneData[];
  slots: SlotData[];
  attachments?: Record<string, AttachmentData>;
  skins?: Record<string, Record<string, string>>;
  animations?: AnimationData[];
  constraints?: ConstraintData[];
  globals?: Record<string, number>;
}

interface Track {
  animation: Animation;
  time: number;
  loop: boolean;
  weight: number;
  playing: boolean;
}

/**
 * The runtime skeleton. Owns the Spine-style update pipeline:
 *   reset -> tracks -> constraints -> world transform -> render.
 * Pure: emits SlotTransform[]; a backend renders it.
 */
export class Skeleton {
  readonly bones = new Map<string, Bone>();
  /** bones in hierarchy order (parents before children) */
  private readonly ordered: Bone[] = [];
  readonly slots: Slot[] = [];
  readonly animations = new Map<string, Animation>();
  readonly constraints: Constraint[] = [];
  readonly globals: Record<string, number>;
  camera: Camera;

  private tracks: Track[] = [];

  /** externally-set input targets (e.g. pointer look) */
  private baseInputs = new Map<string, Vec3>();
  /** per-frame working inputs (base + additive contributions) */
  private working = new Map<string, Vec3>();
  /** spring-smoothed inputs read by constraints */
  private smoothed = new Map<string, Vec3>();
  private inputSprings = new Map<string, { x: Spring; y: Spring; z: Spring }>();
  private boneZSprings = new Map<string, Spring>();

  /** global look inertia (stiffness for input springs) */
  lookInertia = 14;

  constructor(data: SkeletonData) {
    for (const bd of data.bones) this.bones.set(bd.name, new Bone(bd));
    // wire parents + build hierarchy order
    for (const bd of data.bones) {
      const bone = this.bones.get(bd.name)!;
      if (bd.parent) {
        const parent = this.bones.get(bd.parent);
        if (parent) {
          bone.parent = parent;
          parent.children.push(bone);
        }
      }
    }
    const visit = (b: Bone): void => {
      this.ordered.push(b);
      for (const c of b.children) visit(c);
    };
    for (const b of this.bones.values()) if (!b.parent) visit(b);

    for (const sd of data.slots) {
      const slot = new Slot(sd);
      slot.bone = this.bones.get(sd.bone)!;
      this.slots.push(slot);
    }

    for (const ad of data.animations ?? []) {
      this.animations.set(ad.name, new Animation(ad));
    }
    for (const cd of data.constraints ?? []) {
      this.constraints.push(buildConstraint(cd));
    }
    this.globals = { focalLength: 600, lookToZGain: 0.4, ...(data.globals ?? {}) };
    this.camera = makeCamera(this.globals.focalLength);
  }

  /** Build a Skeleton from a validated `.rig` document. */
  static fromRig(doc: RigDocument): Skeleton {
    return new Skeleton({
      bones: doc.skeleton.bones,
      slots: doc.slots,
      attachments: doc.attachments,
      skins: doc.skins,
      animations: doc.animations,
      constraints: doc.constraints,
      globals: doc.globals,
    });
  }

  // ---- inputs -------------------------------------------------------------

  setInput(name: string, v: Partial<Vec3>): void {
    const cur = this.baseInputs.get(name) ?? vec3();
    this.baseInputs.set(name, { x: v.x ?? cur.x, y: v.y ?? cur.y, z: v.z ?? cur.z });
  }

  /** working (mutable) input used by additive animation channels */
  getInputTarget(name: string): Vec3 {
    let w = this.working.get(name);
    if (!w) {
      w = vec3();
      this.working.set(name, w);
    }
    return w;
  }

  /** spring-smoothed input read by constraints/behaviors */
  getInput(name: string): Vec3 {
    return this.smoothed.get(name) ?? vec3();
  }

  // ---- playback -----------------------------------------------------------

  play(name: string, opts: { loop?: boolean; weight?: number } = {}): void {
    const animation = this.animations.get(name);
    if (!animation) return;
    this.tracks.push({
      animation,
      time: 0,
      loop: opts.loop ?? false,
      weight: opts.weight ?? 1,
      playing: true,
    });
  }

  stop(name?: string): void {
    this.tracks = name ? this.tracks.filter((t) => t.animation.name !== name) : [];
  }

  /**
   * Scrub every active track to absolute local time `t` and evaluate a single
   * static frame (no clock advance). Used by the editor timeline to pose the
   * rig while the user drags the playhead.
   */
  seek(t: number): void {
    for (const track of this.tracks) track.time = t;
    this.update(0);
  }

  // ---- update pipeline ----------------------------------------------------

  update(dt: number): void {
    // 1. reset to setup pose
    for (const b of this.ordered) b.resetToSetup();
    for (const s of this.slots) s.resetToSetup();

    // 2. seed working inputs from base, then apply animation tracks
    for (const [name, base] of this.baseInputs) {
      this.working.set(name, { ...base });
    }
    for (const t of this.tracks) {
      if (!t.playing) continue;
      t.time += dt;
      const dur = t.animation.duration;
      let localT = t.time;
      if (t.loop && dur > 0) localT = t.time % dur;
      else if (dur > 0 && t.time > dur) {
        localT = dur;
        t.playing = false;
      }
      t.animation.apply(this, localT, t.weight);
    }

    // 3. spring-smooth inputs, then apply constraints
    for (const [name, w] of this.working) {
      const s = this.inputSprings.get(name) ?? {
        x: new Spring(w.x, this.lookInertia),
        y: new Spring(w.y, this.lookInertia),
        z: new Spring(w.z, this.lookInertia),
      };
      this.inputSprings.set(name, s);
      s.x.stiffness = s.y.stiffness = s.z.stiffness = this.lookInertia;
      this.smoothed.set(name, {
        x: s.x.step(w.x, dt),
        y: s.y.step(w.y, dt),
        z: s.z.step(w.z, dt),
      });
    }
    this.camera.focalLength = this.globals.focalLength ?? this.camera.focalLength;
    for (const c of this.constraints) c.apply(this);

    // 3b. per-bone z inertia (springy foreshorten/anchor lag)
    for (const b of this.ordered) {
      if (b.inertia === undefined) continue;
      const s = this.boneZSprings.get(b.name) ?? new Spring(b.local.z, b.inertia);
      this.boneZSprings.set(b.name, s);
      s.stiffness = b.inertia;
      b.local.z = s.step(b.local.z, dt);
    }

    // 4. world transform
    for (const b of this.ordered) b.updateWorld();
  }

  // ---- render -------------------------------------------------------------

  /** Bind backend attachments to slots via a factory. */
  bindAttachments(
    factory: AttachmentFactory,
    attachmentTable: Record<string, AttachmentData>,
    skin?: Record<string, string>,
  ): void {
    for (const slot of this.slots) {
      const key = (skin && skin[slot.name]) ?? slot.attachmentKey;
      if (!key) continue;
      const data = attachmentTable[key];
      if (!data) continue;
      slot.attachment?.dispose();
      slot.attachment = factory(slot.name, data);
    }
  }

  /** Produce sorted per-slot transforms and push them to bound attachments. */
  render(): SlotTransform[] {
    const pairs: { slot: Slot; t: SlotTransform }[] = [];
    for (const slot of this.slots) {
      if (!slot.visible || !slot.attachment) continue;
      const b = slot.bone;
      const proj = project(this.camera, b.world.tx, b.world.ty, b.worldZ);
      const d = decompose(b.world);
      pairs.push({
        slot,
        t: {
          x: proj.x,
          y: proj.y,
          scale: d.scale * proj.scale,
          rotate: d.rotation,
          skewX: d.skewX,
          skewY: 0,
          alpha: slot.alpha,
          drawOrder: slot.drawOrder,
          morph: slot.morph,
        },
      });
    }
    pairs.sort((a, b) => a.t.drawOrder - b.t.drawOrder);
    for (const { slot, t } of pairs) slot.attachment?.apply(t);
    return pairs.map((p) => p.t);
  }
}

interface Decomposed {
  rotation: number;
  scale: number;
  skewX: number;
}

/** Decompose a 2D affine into rotation(deg) / uniform scale / skewX(deg). */
function decompose(m: { a: number; b: number; c: number; d: number }): Decomposed {
  const r = Math.hypot(m.a, m.b);
  const rotation = Math.atan2(m.b, m.a);
  const skewX = r === 0 ? 0 : Math.atan2(m.a * m.c + m.b * m.d, r * r);
  return {
    rotation: (rotation * 180) / Math.PI,
    scale: r,
    skewX: (skewX * 180) / Math.PI,
  };
}
