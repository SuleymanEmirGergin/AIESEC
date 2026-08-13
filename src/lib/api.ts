import type { Place, SearchParams, ReportData } from "./types";
import type { PresetsResponse } from "./configTypes";
import { retryWithBackoff } from "./retry";
import { TimeoutError, withTimeout } from "./fetchTimeout";

const getApiKey = () => typeof window !== "undefined" ? localStorage.getItem("api_key") : "";

/**
 * Varsayilan sinir. Arama daha uzun tutuluyor cunku backend Overpass'i
 * sorgulayip retry yapabiliyor; diger uclar dogrudan veritabanina gidiyor.
 */
const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * Arama siniri olcume gore secildi (soguk cache, Istanbul viewport):
 * kindergarten ~76 sn, office ~58 sn, high_school 4 dk+.
 * Backend her Overpass sorgusunu 5 kez deniyor ve bunu iki asama icin
 * tekrarliyor; bu yuzden 60 sn'lik bir sinir calisan aramalari da keserdi.
 * Buradaki amac calisani kesmek degil, gercekten asili kalan istegi
 * sinirlamak. Backend retry politikasi iyilestirilirse bu deger dusurulmeli.
 */
const SEARCH_TIMEOUT_MS = 120_000;

/** Export yalnizca veritabanina gidiyor, Overpass beklemesi yok. */
const EXPORT_TIMEOUT_MS = 60_000;

async function fetchWithAuth(
  url: string,
  options: any = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS
) {
  const apiKey = getApiKey();
  const headers = {
    ...options.headers,
    ...(apiKey && { "X-API-KEY": apiKey }),
  };

  const timeout = withTimeout(timeoutMs, options.signal);

  let response: Response;
  try {
    response = await fetch(url, { ...options, headers, signal: timeout.signal });
  } catch (error: any) {
    // Timeout ile kullanici iptalini ayir: cagiran taraf AbortError'i
    // sessizce yutuyor, timeout ise kullaniciya gosterilmeli.
    if (error?.name === "AbortError" && timeout.timedOut()) {
      throw new TimeoutError(timeoutMs);
    }
    throw error;
  } finally {
    timeout.cleanup();
  }

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
  }, SEARCH_TIMEOUT_MS);

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

export interface AccountInfo {
  name: string;
  is_active: boolean;
  plan: "free" | "pro" | "enterprise" | string;
  daily_limit: number;
  used_today: number;
}

/**
 * Kullanicinin anahtarinin plan/kota durumu.
 * Anahtar yoksa veya gecersizse null doner; cagiran taraf bunu
 * "durum bilinmiyor" olarak ele almali, hata olarak degil.
 */
export async function fetchAccount(): Promise<AccountInfo | null> {
  if (typeof window !== "undefined" && !localStorage.getItem("api_key")) {
    return null;
  }
  try {
    const response = await fetchWithAuth("/api/me");
    return await response.json();
  } catch {
    return null;
  }
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
  }, EXPORT_TIMEOUT_MS);

  return response.blob();
}
