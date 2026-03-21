export type Purpose = "friends" | "hangout" | "hookup" | "social";

export type MapPrefs = {
  defaultPurposeFilter: Purpose | "all";
  autoFitPeopleOnOpen: boolean;
};

const MAP_PREFS_KEY = "mf:map-prefs:v1";

export function getDefaultMapPrefs(): MapPrefs {
  return { defaultPurposeFilter: "all", autoFitPeopleOnOpen: true };
}

export function loadMapPrefs(): MapPrefs {
  if (typeof window === "undefined") return getDefaultMapPrefs();
  try {
    const raw = window.localStorage.getItem(MAP_PREFS_KEY);
    if (!raw) return getDefaultMapPrefs();
    const parsed = JSON.parse(raw) as Partial<MapPrefs> | null;
    return {
      defaultPurposeFilter:
        parsed?.defaultPurposeFilter === "all" ||
        parsed?.defaultPurposeFilter === "friends" ||
        parsed?.defaultPurposeFilter === "hangout" ||
        parsed?.defaultPurposeFilter === "hookup" ||
        parsed?.defaultPurposeFilter === "social"
          ? parsed.defaultPurposeFilter
          : "all",
      autoFitPeopleOnOpen: typeof parsed?.autoFitPeopleOnOpen === "boolean" ? parsed.autoFitPeopleOnOpen : true,
    };
  } catch {
    return getDefaultMapPrefs();
  }
}

export function saveMapPrefs(next: MapPrefs) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MAP_PREFS_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("mf:map-prefs-changed", { detail: next }));
  } catch {
    // ignore
  }
}

export function clearMapPrefs() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(MAP_PREFS_KEY);
    const defaults = getDefaultMapPrefs();
    window.dispatchEvent(new CustomEvent("mf:map-prefs-changed", { detail: defaults }));
  } catch {
    // ignore
  }
}

