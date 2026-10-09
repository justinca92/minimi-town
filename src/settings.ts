// Settings live in a JSON file on the Deck (via the Python backend), so they
// survive reboots and Steam client restarts. The backend deletes that file
// when the plugin is uninstalled. Nothing is ever written into Steam itself.
import { callable } from "@decky/api";
import { useEffect, useState } from "react";

export type SortMode = "recent" | "alpha" | "playtime";
export type Theme = "town" | "neon";
export type SkyMode = "auto" | "day" | "dusk" | "night";
export type CardStyle = "wide" | "capsule";

export interface TownSettings {
  homeEnabled: boolean;   // replace the Steam home screen with the town
  theme: Theme;           // "town" = sunny street, "neon" = rainy neon city
  sky: SkyMode;           // town theme only: follow the clock or pin a sky
  cardStyle: CardStyle;   // storefront screens: wide capsule (460×215) or tall capsule (600×900), shown whole
  library: string;        // "base:installed" / "base:all" or a Steam collection id
  sortMode: SortMode;
  soundEnabled: boolean;  // Steam's own UI sounds (step, door…)
  funSounds: boolean;     // the penguin's little boings and splats
  hapticEnabled: boolean; // a light tick on bumps and splats
  mood: number;           // the penguin's mood, 0–100 (it remembers being bothered)
  language: "auto" | "ko" | "en";
  barLook?: { color: string; image: string; backdrop: string }; // Steam's opaque top bar, learned
}

export const DEFAULTS: TownSettings = {
  homeEnabled: true,
  theme: "town",
  sky: "auto",
  cardStyle: "wide",
  library: "base:installed",
  sortMode: "recent",
  soundEnabled: true,
  funSounds: true,
  hapticEnabled: true,
  mood: 80,
  language: "auto",
};

const backendGet = callable<[], Partial<TownSettings> | null>("get_settings");
const backendSet = callable<[settings: TownSettings], boolean>("set_settings");

let current: TownSettings = { ...DEFAULTS };
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export async function initSettings() {
  try {
    const saved = await backendGet();
    current = { ...DEFAULTS, ...(saved ?? {}) };
    if (current.theme !== "town" && current.theme !== "neon") current.theme = "town";
  } catch (e) {
    console.error("[MinimiTown] failed to load settings", e);
  }
  loaded = true;
  emit();
}

/** False until the saved file was read: never save derived values before that. */
export const settingsLoaded = () => loaded;

export function getSettings(): TownSettings {
  return current;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
export function updateSettings(patch: Partial<TownSettings>) {
  current = { ...current, ...patch };
  emit();
  if (!loaded) return; // never overwrite the file with defaults before it was read
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    backendSet(current).catch((e) => console.error("[MinimiTown] failed to save settings", e));
  }, 400);
}

function useStore<T>(read: () => T): T {
  const [v, setV] = useState(read);
  useEffect(() => {
    const l = () => setV(read());
    listeners.add(l);
    l();
    return () => {
      listeners.delete(l);
    };
  }, []);
  return v;
}

export const useSettings = () => useStore(() => current);
export const useSettingsLoaded = () => useStore(() => loaded);
