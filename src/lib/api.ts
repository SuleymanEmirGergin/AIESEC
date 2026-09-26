import type { Place, SearchParams, ReportData } from "./types";
import { TimeoutError, withTimeout } from "./fetchTimeout";

/** Uclar dogrudan veritabanina gidiyor; Overpass beklemesi yok. */
const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * Export Overpass'e gitmiyor ama PDF uretimi satir basina ~5 ms:
 * olcumde 10.000 satir (ust sinir) ~50 sn. 60 sn sinira fazla yakindi.
 */
const EXPORT_TIMEOUT_MS = 120_000;

/** Oturum dustuyse (suresi doldu, listeden cikarildi) giris sayfasina don. */
export function redirectToLogin(): void {
  if (typeof window !== "undefined" && !window.location.pathname.startsWith("/giris")) {
    window.location.assign("/giris?hata=oturum");
  }
}

async function fetchWithAuth(
  url: string,
  options: any = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS
) {
  const headers = { ...options.headers };

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

  if (response.status === 401) redirectToLogin();

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "API request failed" }));
    throw new Error(error.message || "API request failed");
  }

  return response;
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


/** Oturumdaki uye (Google / e-posta ile giris yapan). */
export interface AccountInfo {
  email: string;
  name: string;
  role: "member" | "admin";
  /** E-posta baglantisiyla giris acik mi (SMTP tanimli). */
  emailLogin?: boolean;
}

/** Oturumdaki uye; okunamazsa null. */
export async function fetchAccount(): Promise<AccountInfo | null> {
  try {
    const response = await fetchWithAuth("/api/me");
    return await response.json();
  } catch {
    return null;
  }
}

export type ExportFormat = "xlsx" | "pdf" | "csv";

export interface ExportContext {
  /** Aramanin kategorisi; dosya adinda ve export kaydinda kullaniliyor. */
  type: string;
  radius?: number;
  center?: { lat: number; lon?: number; lng?: number };
  /** Varsayilan csv (eski davranis). */
  format?: ExportFormat;
  /** PDF/Excel basligi, or. "Kadıköy · Otel" ya da liste adi. */
  title?: string;
}

/**
 * Secili kayitlari CSV, Excel ya da PDF olarak disa aktarir.
 *
 * Backend dosyayi kayitlarin kendisinden urettigi icin ID degil tam Place
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
      format: context.format ?? "csv",
      title: context.title ?? null,
    }),
  }, EXPORT_TIMEOUT_MS);

  return response.blob();
}

/**
 * Dosya adi = PDF/Excel basligi ("Kadıköy liseleri.xlsx"). Eskiden
 * "leads_kayitli.csv" iniyordu ve indirilenler klasorunde hangi listenin
 * hangisi oldugu anlasilmiyordu. Turkce harfler korunuyor; yalnizca
 * dosya sistemlerinin kabul etmedigi karakterler temizleniyor.
 */
export function exportFileName(title: string, format: ExportFormat): string {
  const name = title
    .replace(/\s*·\s*/g, " - ")
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    // Windows sondaki nokta ve boslugu dosya adinda kabul etmiyor.
    .replace(/[. ]+$/, "")
    .slice(0, 100);
  return `${name || "Kayıtlı yerler"}.${format}`;
}

/** Blob'u tarayicida basliktan uretilen adla indirir. */
export function downloadBlob(blob: Blob, title: string, format: ExportFormat): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = exportFileName(title, format);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
