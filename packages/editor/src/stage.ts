/**
 * The stage — the live puppet, which is just the runtime bound to a DOM node.
 * The editor is the runtime as a lens, so preview and production share one
 * evaluator: we `bind` once and `render` a pose per frame.
 *
 * Live inputs enter only through controllers. The editor stands in for the host
 * by driving them from a small mutable `drive` map, one entry per *declared*
 * controller — so this is data-driven, not a hardcoded gaze/heart wiring. The
 * transport writes `drive`; the closures just read it.
 */
import { rig, type RigData, type View } from "@articul8/runtime";

export interface Stage {
  /** Mutable stand-in inputs: controller name → current value (undefined = abstain). */
  readonly drive: Record<string, number | undefined>;
  /** Solo one clip at a local time and paint the puppet. */
  showClip(clip: string, t: number): void;
  /** Rest value for a controller (coordinate `default`, else abstain). */
  rest(name: string): number | undefined;
}

/** Build the puppet stage over a mount node, standing in for the live host. */
export function mountStage(host: HTMLElement, data: RigData, svgText: string): Stage {
  const decls = data.controllers ?? {};

  const restOf = (name: string): number | undefined => {
    const ed = decls[name]?.editor;
    if (ed && ed.as === "coordinate") return ed.default ?? 0;
    return undefined; // clocks and undeclared inputs abstain at rest
  };

  const drive: Record<string, number | undefined> = {};
  for (const name of Object.keys(decls)) drive[name] = restOf(name);

  // One closure per declared controller, all reading the shared drive map. A
  // clock-clocked clip passes its local time in, but we ignore it: the editor's
  // playhead IS the clock, delivered via drive.
  const controllers: Record<string, (t: number) => number | undefined> = {};
  for (const name of Object.keys(decls)) controllers[name] = () => drive[name];

  const r = rig(data, { controllers });
  const view: View = r.bind(host, svgText);
  const anims = r.anims;

  return {
    drive,
    rest: restOf,
    showClip(clip, t) {
      const a = anims[clip];
      if (!a) return;
      view.render(a(t));
    },
  };
}
