import type { AdminReport, AdminOverride, AdminStats } from "./types";
import { TimeoutError, withTimeout } from "./fetchTimeout";

const getAdminKey = () => typeof window !== "undefined" ? sessionStorage.getItem("admin_key") : "";

/** Admin uclari dogrudan veritabanina gidiyor; Overpass beklemesi yok. */
const ADMIN_TIMEOUT_MS = 15_000;

const fetchAdmin = async (url: string, options: any = {}) => {
  const adminKey = getAdminKey();
  const headers = {
    ...options.headers,
    "Content-Type": "application/json",
    "X-ADMIN-KEY": adminKey,
  };

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

  if (response.status === 401) {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("admin_key");
      window.location.reload();
    }
    throw new Error("Unauthorized");
  }
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Admin API error");
  }
  return response.json();
};

/**
 * Anahtari dogrular ama fetchAdmin'in 401 davranisini tetiklemez.
 *
 * Giris formunun ihtiyaci bu: fetchAdmin 401 aldiginda sessionStorage'i
 * temizleyip sayfayi yeniliyor. Giris denemesinde bu, yanlis anahtar
 * girildiginde formun sessizce yeniden yuklenmesi ve kullanicinin hicbir
 * hata mesaji gormemesi demekti.
 */
async function verifyAdminKey(key: string): Promise<boolean> {
  const timeout = withTimeout(ADMIN_TIMEOUT_MS);
  try {
    const response = await fetch("/api/admin/stats", {
      headers: { "X-ADMIN-KEY": key },
      signal: timeout.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    timeout.cleanup();
  }
}

export const adminApi = {
  verifyKey: verifyAdminKey,
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
