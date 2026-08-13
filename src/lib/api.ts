import type { Place, SearchParams, ReportData } from "./types";
import type { PresetsResponse } from "./configTypes";
import { retryWithBackoff } from "./retry";

const getApiKey = () => typeof window !== "undefined" ? localStorage.getItem("api_key") : "";

async function fetchWithAuth(url: string, options: any = {}) {
  const apiKey = getApiKey();
  const headers = {
    ...options.headers,
    ...(apiKey && { "X-API-KEY": apiKey }),
  };

  const response = await fetch(url, { ...options, headers });
  
  if (response.status === 429) {
    throw new Error("QUOTA_EXCEEDED");
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "API request failed" }));
    throw new Error(error.message || "API request failed");
  }

  return response;
}

export interface SearchMeta {
  cached: boolean;
  provider: string;
  /** Backend'e gonderilen yaricap (m). */
  radiusUsed: number;
  /** Viewport'u kapsamak icin gereken yaricap (m). */
  viewportRadius: number;
  /** true ise harita sinirdan genis; kenarlardaki yerler sonuca girmedi. */
  radiusClamped: boolean;
}

export interface SearchResult {
  places: Place[];
  total: number;
  meta: SearchMeta;
}

export async function searchPlaces(
  params: { bbox: [number, number, number, number]; category: string; limit?: number },
  options?: { signal?: AbortSignal }
): Promise<SearchResult> {
  const response = await fetchWithAuth("/api/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
    signal: options?.signal,
  });

  const data = await response.json();
  return {
    places: data.data ?? [],
    total: data.total ?? 0,
    meta: data.meta ?? {},
  };
}

export async function reportPlace(report: ReportData): Promise<{ success: boolean }> {
  const response = await fetchWithAuth("/api/report", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(report),
  });

  return response.json();
}

export async function fetchPresets(options?: { signal?: AbortSignal }): Promise<PresetsResponse> {
  const response = await fetchWithAuth("/api/presets", {
    signal: options?.signal,
  });

  return response.json();
}

export interface ExportContext {
  /** Aramanin kategorisi; CSV dosya adinda ve export kaydinda kullaniliyor. */
  type: string;
  radius?: number;
  center?: { lat: number; lon?: number; lng?: number };
}

/**
 * Secili kayitlari CSV olarak disa aktarir.
 *
 * Backend CSV'yi kayitlarin kendisinden urettigi icin ID degil tam Place
 * nesneleri gonderiliyor. Boylece export, arama cache'inin hala duruyor
 * olmasina bagimli olmuyor.
 */
export async function exportLeads(
  places: Place[],
  context: ExportContext
): Promise<Blob> {
  const response = await fetchWithAuth("/api/export", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      items: places,
      type: context.type,
      radius: context.radius ?? 0,
      center: context.center ?? null,
    }),
  });

  return response.blob();
}
