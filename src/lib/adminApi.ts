import type { AdminReport, AdminOverride, AdminStats } from "./types";

const getAdminKey = () => typeof window !== "undefined" ? sessionStorage.getItem("admin_key") : "";

const fetchAdmin = async (url: string, options: any = {}) => {
  const adminKey = getAdminKey();
  const headers = {
    ...options.headers,
    "Content-Type": "application/json",
    "X-ADMIN-KEY": adminKey,
  };

  const response = await fetch(url, { ...options, headers });
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
