export type ThemePref = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const THEME_PREF_KEY = "mf:theme-pref:v1";

export function getThemePref(): ThemePref {
  if (typeof window === "undefined") return "system";
  const raw = window.localStorage.getItem(THEME_PREF_KEY);
  return raw === "light" || raw === "dark" || raw === "system" ? raw : "system";
}

export function resolveTheme(pref: ThemePref): ResolvedTheme {
  if (pref === "light" || pref === "dark") return pref;
  if (typeof window === "undefined") return "light";
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
}

export function applyResolvedTheme(theme: ResolvedTheme) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
  try {
    document.documentElement.style.colorScheme = theme;
  } catch {
    // ignore
  }
}

export function setThemePref(pref: ThemePref) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(THEME_PREF_KEY, pref);
  const resolved = resolveTheme(pref);
  applyResolvedTheme(resolved);
  window.dispatchEvent(
    new CustomEvent("mf:theme-pref-changed", { detail: { pref, resolved } }),
  );
}

export function syncThemeToSystemIfNeeded() {
  if (typeof window === "undefined") return;
  const pref = getThemePref();
  if (pref !== "system") return;
  applyResolvedTheme(resolveTheme(pref));
}

