/**
 * API client for connecting to the FastAPI backend.
 */

const runtimeEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
export const API_BASE_URL = runtimeEnv?.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";
const REQUEST_TIMEOUT_MS = 12000;

export interface Place {
  id: string;
  name: string;
  type: string;
  ownership: string;
  coordinates: { lat: number; lng: number };
  distance_km?: number;
  tags: Record<string, string>;
}

export interface SearchParams {
  bbox: [number, number, number, number];
  categories: string[];
  limit?: number;
  ref_lat?: number;
  ref_lon?: number;
}

interface SearchResponse {
  places?: Place[];
  results?: Place[];
}

interface HealthResponse {
  status: string;
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer: ReturnType<typeof setTimeout> = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Request timed out. Verify backend availability.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.text();
    const trimmed = body.trim();
    if (trimmed.length > 0) {
      return `${fallback}: ${trimmed.slice(0, 160)}`;
    }
  } catch {
    // Ignore parse errors and use fallback.
  }
  return fallback;
}

export async function searchPlaces(params: SearchParams): Promise<Place[]> {
  const { bbox, categories, limit = 50, ref_lat, ref_lon } = params;

  const url = new URL(`${API_BASE_URL}/api/search`);
  url.searchParams.set("bbox", bbox.join(","));
  url.searchParams.set("types", categories.join(","));
  url.searchParams.set("limit", String(limit));
  if (ref_lat !== undefined && ref_lon !== undefined) {
    url.searchParams.set("ref_lat", String(ref_lat));
    url.searchParams.set("ref_lon", String(ref_lon));
  }

  const response = await fetchWithTimeout(url.toString(), {
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Search failed (${response.status})`));
  }

  const data = (await response.json()) as SearchResponse;
  if (Array.isArray(data.places)) return data.places;
  if (Array.isArray(data.results)) return data.results;
  return [];
}

export async function getHealthStatus(): Promise<HealthResponse> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/health`, {
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Health check failed (${response.status})`));
  }

  return (await response.json()) as HealthResponse;
}
