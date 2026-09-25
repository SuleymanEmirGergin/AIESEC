import type { AdminReport, AdminOverride, AdminStats } from "./types";
import { TimeoutError, withTimeout } from "./fetchTimeout";
import { redirectToLogin } from "./api";

/** Admin uclari dogrudan veritabanina gidiyor; Overpass beklemesi yok. */
const ADMIN_TIMEOUT_MS = 15_000;

const fetchAdmin = async (url: string, options: any = {}) => {
  // Yetki oturumdaki rolden; yonetici anahtari sunucuda ekleniyor.
  const headers = { ...options.headers, "Content-Type": "application/json" };

  const timeout = withTimeout(ADMIN_TIMEOUT_MS, options.signal);

  let response: Response;
  try {
    response = await fetch(url, { ...options, headers, signal: timeout.signal });
  } catch (error: any) {
    if (error?.name === "AbortError" && timeout.timedOut()) {
      throw new TimeoutError(ADMIN_TIMEOUT_MS);
    }
    throw error;
  } finally {
    timeout.cleanup();
  }

  if (response.status === 401) redirectToLogin();
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Admin API error");
  }
  return response.json();
};

export const adminApi = {
  getReports: (params: any): Promise<{ data: AdminReport[]; total: number }> => {
    const query = new URLSearchParams(params).toString();
    return fetchAdmin(`/api/admin/reports?${query}`);
  },
  updateReport: (id: string, updates: Partial<AdminReport>): Promise<AdminReport> => {
    return fetchAdmin(`/api/admin/reports/${id}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
  },
  getOverrides: (params: any): Promise<AdminOverride[]> => {
    const query = new URLSearchParams(params).toString();
    return fetchAdmin(`/api/admin/overrides?${query}`);
  },
  upsertOverride: (override: Partial<AdminOverride>): Promise<AdminOverride> => {
    return fetchAdmin(`/api/admin/overrides`, {
      method: "POST",
      body: JSON.stringify(override),
    });
  },
  deleteOverride: (id: string): Promise<void> => {
    return fetchAdmin(`/api/admin/overrides/${id}`, { method: "DELETE" });
  },
  getStats: (): Promise<AdminStats> => {
    return fetchAdmin(`/api/admin/stats`);
  },
};
