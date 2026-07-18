import { useState } from "preact/hooks";
import { currentTheme, toggleTheme, type Theme } from "../theme.js";

export function TitleBar(): preact.JSX.Element {
  const [theme, setThemeState] = useState<Theme>(currentTheme());
  return (
    <div class="panel titlebar">
      <span class="wordmark">
        articul<b>8</b>
      </span>
      <span class="eyebrow">SVG 2.5D skeletal animation</span>
      <span class="spacer" />
      <button
        class="icon"
        title="Toggle theme"
        onClick={() => setThemeState(toggleTheme())}
      >
        {theme === "dark" ? "☾" : "☀"}
      </button>
    </div>
  );
}
