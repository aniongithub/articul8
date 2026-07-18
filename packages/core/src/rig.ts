import type { AttachmentData } from "./attachment.js";
import type { BoneData } from "./bone.js";
import type { SlotData } from "./slot.js";
import type { AnimationData } from "./animation.js";
import type { ConstraintData } from "./constraint.js";

/**
 * The `.rig` document — the real deliverable. Plain JSON, art referenced not
 * embedded. The editor serializes it; the runtime deserializes it.
 */
export interface RigDocument {
  /** schema version for forward-compat */
  version: 1;
  name?: string;
  /** viewBox the art is authored in: [minX, minY, width, height] */
  viewBox: [number, number, number, number];
  skeleton: { bones: BoneData[] };
  slots: SlotData[];
  attachments: Record<string, AttachmentData>;
  /** swappable attachment sets: skinName -> (slotName -> attachmentKey) */
  skins?: Record<string, Record<string, string>>;
  animations?: AnimationData[];
  constraints?: ConstraintData[];
  /** projection strength etc. */
  globals?: Record<string, number>;
}

export class RigValidationError extends Error {}

/** Parse + validate a `.rig` JSON string (or object) into a RigDocument. */
export function parseRig(input: string | unknown): RigDocument {
  const raw: unknown = typeof input === "string" ? JSON.parse(input) : input;
  return validateRig(raw);
}

export function validateRig(raw: unknown): RigDocument {
  if (typeof raw !== "object" || raw === null) {
    throw new RigValidationError("rig must be an object");
  }
  const doc = raw as Record<string, unknown>;

  if (doc.version !== 1) {
    throw new RigValidationError(`unsupported rig version: ${String(doc.version)}`);
  }
  if (!Array.isArray(doc.viewBox) || doc.viewBox.length !== 4) {
    throw new RigValidationError("viewBox must be [minX, minY, width, height]");
  }
  const skeleton = doc.skeleton as { bones?: unknown } | undefined;
  if (!skeleton || !Array.isArray(skeleton.bones)) {
    throw new RigValidationError("skeleton.bones must be an array");
  }
  if (!Array.isArray(doc.slots)) {
    throw new RigValidationError("slots must be an array");
  }
  if (typeof doc.attachments !== "object" || doc.attachments === null) {
    throw new RigValidationError("attachments must be an object");
  }

  const boneNames = new Set<string>();
  for (const b of skeleton.bones as BoneData[]) {
    if (!b.name) throw new RigValidationError("every bone needs a name");
    if (boneNames.has(b.name)) {
      throw new RigValidationError(`duplicate bone name: ${b.name}`);
    }
    boneNames.add(b.name);
  }
  for (const b of skeleton.bones as BoneData[]) {
    if (b.parent && !boneNames.has(b.parent)) {
      throw new RigValidationError(`bone "${b.name}" references missing parent "${b.parent}"`);
    }
  }
  for (const s of doc.slots as SlotData[]) {
    if (!s.name) throw new RigValidationError("every slot needs a name");
    if (!boneNames.has(s.bone)) {
      throw new RigValidationError(`slot "${s.name}" references missing bone "${s.bone}"`);
    }
  }

  return raw as RigDocument;
}

/** Serialize a RigDocument to pretty JSON for saving/export. */
export function serializeRig(doc: RigDocument): string {
  return JSON.stringify(doc, null, 2);
}
