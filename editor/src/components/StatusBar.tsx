import type { Mode } from "../app.js";

interface Props {
  mode: Mode;
  onToggleMode: () => void;
  fps: number;
  status: string;
}

export function StatusBar({ mode, onToggleMode, fps, status }: Props): preact.JSX.Element {
  return (
    <div class="panel statusbar">
      <span class="dot" />
      <span>
        MODE:{" "}
        <span class="mode" style="cursor:pointer" onClick={onToggleMode} title="Toggle SETUP / ANIMATE">
          {mode}
        </span>
      </span>
      <span>{status}</span>
      <span class="spacer" />
      <span>{fps.toFixed(0)} FPS</span>
    </div>
  );
}
