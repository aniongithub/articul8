import type { Attachment, AttachmentData, SlotTransform } from "@articul8/core";
import { blendPath } from "./path-morph.js";

const SVG_NS = "http://www.w3.org/2000/svg";

function transformString(t: SlotTransform): string {
  // Art is authored around its local origin; the projected anchor positions it.
  let s = `translate(${round(t.x)} ${round(t.y)}) rotate(${round(t.rotate)}) scale(${round(t.scale)})`;
  if (t.skewX) s += ` skewX(${round(t.skewX)})`;
  return s;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Rigid sprite: a `<use>` referencing a symbol/path id in the art defs. */
export class SVGRegionAttachment implements Attachment {
  readonly element: SVGGElement;
  private use: SVGUseElement;

  constructor(readonly data: AttachmentData) {
    this.element = document.createElementNS(SVG_NS, "g");
    this.use = document.createElementNS(SVG_NS, "use");
    this.use.setAttribute("href", data.href);
    this.element.appendChild(this.use);
  }

  apply(t: SlotTransform): void {
    this.element.setAttribute("transform", transformString(t));
    this.element.style.opacity = String(t.alpha);
  }

  dispose(): void {
    this.element.remove();
  }
}

/** Bitmap sprite: an `<image>`. */
export class SVGImageAttachment implements Attachment {
  readonly element: SVGImageElement;

  constructor(readonly data: AttachmentData) {
    this.element = document.createElementNS(SVG_NS, "image");
    this.element.setAttribute("href", data.href);
  }

  apply(t: SlotTransform): void {
    this.element.setAttribute("transform", transformString(t));
    this.element.style.opacity = String(t.alpha);
  }

  dispose(): void {
    this.element.remove();
  }
}

/** Deformable path: a `<path>` blended from base + morph targets. */
export class SVGMeshAttachment implements Attachment {
  readonly element: SVGPathElement;
  private base: string;
  private targets: Record<string, string>;

  constructor(readonly data: AttachmentData, basePathData: string) {
    this.element = document.createElementNS(SVG_NS, "path");
    this.base = basePathData;
    this.targets = data.morphTargets ?? {};
    this.element.setAttribute("d", this.base);
  }

  apply(t: SlotTransform): void {
    const d = blendPath(this.base, this.targets, t.morph);
    this.element.setAttribute("d", d);
    this.element.setAttribute("transform", transformString(t));
    this.element.style.opacity = String(t.alpha);
  }

  dispose(): void {
    this.element.remove();
  }
}

export type SvgAttachment = SVGRegionAttachment | SVGImageAttachment | SVGMeshAttachment;
