import { NextRequest, NextResponse } from "next/server";

/**
 * Next.js route handler'lari ile FastAPI backend arasindaki ortak proxy katmani.
 *
 * Neden gerekli: tarayici backend'e dogrudan gitmiyor (CORS + API anahtarinin
 * disari acilmamasi icin). Tum cagrilar once Next.js sunucusuna geliyor,
 * buradan backend'e iletiliyor.
 */

/** Backend'in kok adresi, ornek: http://backend:8000 */
function backendOrigin(): string | null {
  const base = process.env.NEXT_PUBLIC_API_BASE;
  if (!base) return null;

  const trimmed = base.replace(/\/+$/, "");
  // NEXT_PUBLIC_API_BASE ".../api" ile bitiyor; admin router'i ise kok
  // seviyede (/admin) yasiyor. Ikisini de uretebilmek icin origin'i cikariyoruz.
  return trimmed.replace(/\/api$/, "");
}

/** /api prefix'i altindaki backend uclari (search, report, export, presets) */
export function apiUrl(path: string): string | null {
  const origin = backendOrigin();
  return origin ? `${origin}/api${path}` : null;
}

/** Kok seviyedeki backend uclari (admin, health, metrics) */
export function rootUrl(path: string): string | null {
  const origin = backendOrigin();
  return origin ? `${origin}${path}` : null;
}

/**
 * Istemciden gelen kimlik basliklarini backend'e tasir.
 * Baska hicbir basligi gecirmiyoruz: host/cookie gibi basliklarin
 * sizmasi istenmiyor.
 */
function authHeaders(req: NextRequest): Record<string, string> {
  const headers: Record<string, string> = {};

  const apiKey = req.headers.get("x-api-key");
  if (apiKey) headers["X-API-KEY"] = apiKey;

  const adminKey = req.headers.get("x-admin-key");
  if (adminKey) headers["X-ADMIN-KEY"] = adminKey;

  return headers;
}

interface ProxyOptions {
  /** Backend'e gonderilecek tam URL (apiUrl/rootUrl ile uretilir) */
  url: string | null;
  method: string;
  /** Govde; verilmezse istek govdesiz gider */
  body?: unknown;
  /** Hata mesajlarinda kullanilacak insan okur etiket */
  label: string;
}

/**
 * Backend'e istek atar ve cevabi istemciye uygun sekilde geri dondurur.
 *
 * Hata formati bilincli olarak { message } - adminApi.ts ve api.ts
 * hatalari `error.message` alanindan okuyor.
 */
export async function proxyToBackend(
  req: NextRequest,
  { url, method, body, label }: ProxyOptions
): Promise<NextResponse> {
  if (!url) {
    return NextResponse.json(
      { message: "NEXT_PUBLIC_API_BASE tanimli degil; backend'e baglanilamiyor." },
      { status: 503 }
    );
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        ...authHeaders(req),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
  } catch (error: any) {
    console.error(`[proxy] ${label} - backend'e ulasilamadi:`, error?.message);
    return NextResponse.json(
      { message: `Backend'e ulasilamadi (${label}).` },
      { status: 502 }
    );
  }

  return passThrough(response, label);
}

/**
 * Backend cevabini istemciye aktarir.
 * CSV gibi JSON olmayan cevaplar govdesi bozulmadan gecer.
 */
async function passThrough(response: Response, label: string): Promise<NextResponse> {
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    const blob = await response.blob();
    const headers = new Headers();
    if (contentType) headers.set("Content-Type", contentType);

    const disposition = response.headers.get("content-disposition");
    if (disposition) headers.set("Content-Disposition", disposition);

    return new NextResponse(blob, { status: response.status, headers });
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    // FastAPI hatalari { detail: ... } donuyor, istemci ise { message } bekliyor.
    const detail =
      data && typeof data.detail === "string"
        ? data.detail
        : `${label} basarisiz (HTTP ${response.status})`;
    return NextResponse.json({ message: detail }, { status: response.status });
  }

  return NextResponse.json(data, { status: response.status });
}
