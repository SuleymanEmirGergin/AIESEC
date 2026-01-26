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

export async function searchPlaces(
  params: { bbox: [number, number, number, number]; category: string; limit?: number },
  options?: { signal?: AbortSignal }
): Promise<Place[]> {
  const response = await fetchWithAuth("/api/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
    signal: options?.signal,
  });

  const data = await response.json();
  return data.data || [];
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

export async function exportLeads(ids: string[]): Promise<Blob> {
  const response = await fetchWithAuth("/api/export", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ids }),
  });

  return response.blob();
}
