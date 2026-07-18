/** Theme = "dark" | "light". Persisted in localStorage; .dark class on <html>.
 *  Init priority (in index.html, pre-paint): localStorage -> prefers-color-scheme -> dark. */
export type Theme = "dark" | "light";

export function currentTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function setTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem("theme", theme);
  } catch {
    /* private mode */
  }
}

export function toggleTheme(): Theme {
  const next: Theme = currentTheme() === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}

/** Read a CSS custom property from :root (for theming the timeline canvas). */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
