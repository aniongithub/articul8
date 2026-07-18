import type { Mode } from "../app.js";

interface Props {
  stageRef: (el: HTMLDivElement | null) => void;
  onLook: (nx: number, ny: number) => void;
  onLookEnd: () => void;
  mode: Mode;
}

/** Hosts the live RigPlayer SVG. Pointer position becomes the `look` input. */
export function Viewport({ stageRef, onLook, onLookEnd, mode }: Props): preact.JSX.Element {
  const handleMove = (e: PointerEvent): void => {
    const el = e.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
    const ny = ((e.clientY - r.top) / r.height) * 2 - 1;
    onLook(Math.max(-1, Math.min(1, nx)), Math.max(-1, Math.min(1, ny)));
  };
  return (
    <div class="panel viewport" onPointerMove={handleMove} onPointerLeave={onLookEnd}>
      <div class="stage" ref={stageRef} />
      <div class="badge">{mode === "SETUP" ? "rest pose · drag to look" : "playing · move to look"}</div>
    </div>
  );
}
