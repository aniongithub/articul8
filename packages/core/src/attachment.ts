/**
 * The backend seam. The pure core emits a `SlotTransform` per visible slot; a
 * swappable backend (SVG first) turns it into pixels. SVG must not leak here.
 */

export interface SlotTransform {
  /** projected screen position */
  x: number;
  y: number;
  /** emergent from z-projection */
  scale: number;
  /** in-plane rotation, degrees */
  rotate: number;
  /** shear, degrees */
  skewX: number;
  skewY: number;
  alpha: number;
  drawOrder: number;
  /** morph target name -> weight, for deformable attachments */
  morph: Record<string, number>;
}

export type AttachmentType = "svgRegion" | "svgMesh" | "image";

/** Backend-agnostic attachment description (art referenced, never embedded). */
export interface AttachmentData {
  type: AttachmentType;
  /** art reference: an SVG path id, element id, or image URL */
  href: string;
  /** matched-topology morph targets for svgMesh: name -> SVG path data */
  morphTargets?: Record<string, string>;
  /** local pivot for scaling/rotation, in art units */
  pivot?: { x: number; y: number };
}

/**
 * A backend attachment instance. The core owns geometry; the backend owns
 * rendering. `apply` receives the fully-resolved SlotTransform.
 */
export interface Attachment {
  readonly data: AttachmentData;
  apply(t: SlotTransform): void;
  /** detach / cleanup */
  dispose(): void;
}

/** Factory a backend registers to build attachments from `.rig` data. */
export type AttachmentFactory = (
  slotName: string,
  data: AttachmentData,
) => Attachment;
