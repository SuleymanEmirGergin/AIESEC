/**
 * Simple client-side cache for API results.
 * Keyed by search parameters (type, radius, latRounded, lonRounded).
 * Default TTL: 5 minutes.
 */
export interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const cacheStore = new Map<string, CacheEntry<any>>();

// Session Storage Key
const SESSION_CACHE_KEY = "nearby_search_cache";

/**
 * Loads session storage cache into memory on initialization
 */
function syncWithSessionStorage() {
  if (typeof window === "undefined") return;
  try {
    const raw = sessionStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    Object.entries(parsed).forEach(([key, entry]: [string, any]) => {
      // Validate expiry before backfilling Map
      if (Date.now() - entry.timestamp < DEFAULT_TTL_MS) {
        cacheStore.set(key, entry);
      }
    });
  } catch (e) {
    console.warn("Failed to sync cache with sessionStorage", e);
  }
}

// Initial sync
syncWithSessionStorage();

function saveToSessionStorage() {
  if (typeof window === "undefined") return;
  try {
    const obj = Object.fromEntries(cacheStore.entries());
    sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(obj));
  } catch (e) {
    console.warn("Failed to persist cache to sessionStorage", e);
  }
}

/**
 * Rounds a coordinate to specified precision (default 4 decimals, ~11m accuracy).
 */
export function roundCoord(coord: number, precision: number = 4): string {
  return coord.toFixed(precision);
}

export function generateCacheKey(
  type: string,
  radius: number,
  lat: number,
  lng: number
): string {
  return `${type}:${radius}:${roundCoord(lat)}:${roundCoord(lng)}`;
}

export function setCache<T>(key: string, data: T): void {
  cacheStore.set(key, {
    data,
    timestamp: Date.now(),
  });
  saveToSessionStorage();
}

export function getCache<T>(key: string): T | null {
  const entry = cacheStore.get(key);
  
  if (!entry) return null;
  
  const isExpired = Date.now() - entry.timestamp > DEFAULT_TTL_MS;
  if (isExpired) {
    cacheStore.delete(key);
    saveToSessionStorage();
    return null;
  }
  
  return entry.data as T;
}

export function clearCache(): void {
  cacheStore.clear();
  if (typeof window !== "undefined") {
    sessionStorage.removeItem(SESSION_CACHE_KEY);
  }
}
