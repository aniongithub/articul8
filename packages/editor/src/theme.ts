/**
 * Metro theme toggle — light/dark via a `.dark` class on <html>.
 * Init priority: localStorage → prefers-color-scheme → dark default.
 * See standards/metro-ui-system.
 */

const KEY = "a8-theme";
type Theme = "light" | "dark";

const mql = window.matchMedia("(prefers-color-scheme: dark)");

function stored(): Theme | null {
  const v = localStorage.getItem(KEY);
  return v === "light" || v === "dark" ? v : null;
}

function apply(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

function current(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export interface ThemeControl {
  /** Subscribe to theme changes (e.g. to re-push colours into a canvas). */
  onChange(cb: (theme: Theme) => void): void;
}

export function initTheme(toggleButton?: HTMLElement | null): ThemeControl {
  const listeners = new Set<(theme: Theme) => void>();
  const set = (theme: Theme): void => {
    apply(theme);
    for (const cb of listeners) cb(theme);
  };

  // Default to dark when nothing is stored and the OS has no preference.
  apply(stored() ?? (mql.matches ? "dark" : "dark"));

  toggleButton?.addEventListener("click", () => {
    const next: Theme = current() === "dark" ? "light" : "dark";
    localStorage.setItem(KEY, next);
    set(next);
  });

  // Follow OS changes only while the user hasn't pinned a choice.
  mql.addEventListener("change", (e) => {
    if (!stored()) set(e.matches ? "dark" : "light");
  });

  return {
    onChange(cb) {
      listeners.add(cb);
    },
  };
}
