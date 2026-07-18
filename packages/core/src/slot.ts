import type { Attachment } from "./attachment.js";
import type { Bone } from "./bone.js";

/** Draw order + which attachment shows + morph-weight bindings. */
export interface SlotData {
  name: string;
  /** bone this slot is pinned to */
  bone: string;
  /** attachment key (into the rig's attachment table / active skin) */
  attachment?: string | null;
  drawOrder: number;
  alpha?: number;
  /** setup morph weights: target name -> weight */
  morph?: Record<string, number>;
}

/** Runtime slot. */
export class Slot {
  readonly name: string;
  bone!: Bone;
  attachment: Attachment | null = null;
  attachmentKey: string | null;
  drawOrder: number;
  visible = true;

  readonly setupMorph: Record<string, number>;
  readonly setupAlpha: number;

  /** working state, reset from setup each frame */
  morph: Record<string, number> = {};
  alpha = 1;

  constructor(data: SlotData) {
    this.name = data.name;
    this.attachmentKey = data.attachment ?? null;
    this.drawOrder = data.drawOrder;
    this.setupMorph = { ...(data.morph ?? {}) };
    this.setupAlpha = data.alpha ?? 1;
  }

  resetToSetup(): void {
    this.morph = { ...this.setupMorph };
    this.alpha = this.setupAlpha;
  }
}
