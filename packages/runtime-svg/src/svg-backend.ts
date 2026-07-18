import type { AttachmentData, AttachmentFactory } from "@articul8/core";
import {
  SVGImageAttachment,
  SVGMeshAttachment,
  SVGRegionAttachment,
  type SvgAttachment,
} from "./svg-attachments.js";

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Owns the SVG DOM: a root <svg> with <defs> (art, referenced not embedded in
 * the rig) and a render <g>. Provides the AttachmentFactory the core binds to.
 */
export class SVGBackend {
  readonly svg: SVGSVGElement;
  private defs: SVGDefsElement;
  private layer: SVGGElement;
  private artIndex = new Map<string, SVGElement>();
  private built = new Map<string, SvgAttachment>();

  constructor(container: HTMLElement, viewBox: [number, number, number, number]) {
    this.svg = document.createElementNS(SVG_NS, "svg");
    this.svg.setAttribute("viewBox", viewBox.join(" "));
    this.svg.setAttribute("width", "100%");
    this.svg.setAttribute("height", "100%");
    this.svg.style.display = "block";

    this.defs = document.createElementNS(SVG_NS, "defs");
    this.layer = document.createElementNS(SVG_NS, "g");
    this.layer.setAttribute("class", "articul8-layer");
    this.svg.append(this.defs, this.layer);
    container.appendChild(this.svg);
  }

  /** Inject art (an SVG fragment string) into <defs> and index its ids. */
  setArt(svgFragment: string): void {
    this.defs.innerHTML = svgFragment;
    this.artIndex.clear();
    this.defs.querySelectorAll<SVGElement>("[id]").forEach((el) => {
      this.artIndex.set(el.id, el);
    });
  }

  /** Look up a base path's `d` for an svgMesh attachment. */
  private basePathData(href: string): string {
    const id = href.startsWith("#") ? href.slice(1) : href;
    const el = this.artIndex.get(id);
    return el?.getAttribute("d") ?? "";
  }

  /** The factory the core uses to build attachments from `.rig` data. */
  factory: AttachmentFactory = (slotName: string, data: AttachmentData) => {
    let att: SvgAttachment;
    switch (data.type) {
      case "image":
        att = new SVGImageAttachment(data);
        break;
      case "svgMesh":
        att = new SVGMeshAttachment(data, this.basePathData(data.href));
        break;
      case "svgRegion":
      default:
        att = new SVGRegionAttachment(data);
        break;
    }
    this.layer.appendChild(att.element);
    this.built.set(slotName, att);
    return att;
  };

  /** Reorder DOM to match draw order (slots given low->high). */
  reorder(slotNamesInDrawOrder: string[]): void {
    for (const name of slotNamesInDrawOrder) {
      const att = this.built.get(name);
      if (att) this.layer.appendChild(att.element);
    }
  }

  clear(): void {
    for (const att of this.built.values()) att.dispose();
    this.built.clear();
    this.layer.replaceChildren();
  }

  dispose(): void {
    this.clear();
    this.svg.remove();
  }
}
