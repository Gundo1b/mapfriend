import * as SecureStore from "expo-secure-store";

export type Purpose = "friends" | "hangout" | "hookup" | "social";

export type MapPrefs = {
  defaultPurposeFilter: Purpose | "all";
  autoFitPeopleOnOpen: boolean;
};

const MAP_PREFS_KEY = "mf:map-prefs:v1";

export function getDefaultMapPrefs(): MapPrefs {
  return { defaultPurposeFilter: "all", autoFitPeopleOnOpen: true };
}

export async function loadMapPrefs(): Promise<MapPrefs> {
  try {
    const raw = await SecureStore.getItemAsync(MAP_PREFS_KEY);
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
      autoFitPeopleOnOpen:
        typeof parsed?.autoFitPeopleOnOpen === "boolean" ? parsed.autoFitPeopleOnOpen : true,
    };
  } catch {
    return getDefaultMapPrefs();
  }
}

export async function saveMapPrefs(next: MapPrefs): Promise<void> {
  try {
    await SecureStore.setItemAsync(MAP_PREFS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export async function clearMapPrefs(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(MAP_PREFS_KEY);
  } catch {
    // ignore
  }
}

