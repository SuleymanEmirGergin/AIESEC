import type { PresetsResponse } from "./configTypes";

const KEY = "app.presets.v1";
const TTL_MS = 24 * 60 * 60 * 1000; // 24 Hours

interface CacheWrapper {
  savedAt: number;
  data: PresetsResponse;
}

/**
 * Loads presets from localStorage if they exist and haven't expired.
 */
export function loadCachedPresets(): PresetsResponse | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;

    const wrapper: CacheWrapper = JSON.parse(raw);
    const now = Date.now();

    if (now - wrapper.savedAt > TTL_MS) {
      localStorage.removeItem(KEY);
      return null;
    }

    return wrapper.data;
  } catch (error) {
    console.error("Error loading cached presets:", error);
    return null;
  }
}

/**
 * Saves presets to localStorage with current timestamp.
 */
export function saveCachedPresets(data: PresetsResponse): void {
  if (typeof window === "undefined") return;

  try {
    const wrapper: CacheWrapper = {
      savedAt: Date.now(),
      data,
    };
    localStorage.setItem(KEY, JSON.stringify(wrapper));
  } catch (error) {
    console.error("Error saving presets to cache:", error);
  }
}

/**
 * Clears the presets cache.
 */
export function clearCachedPresets(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}
