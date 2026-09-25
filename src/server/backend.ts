import { NextRequest, NextResponse } from "next/server";
import { auth } from "../auth";
import { getMember, type Member } from "./team";

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

/** Anahtarin kime ait oldugu. Kisisel anahtar kalkti; hep sunucununki. */
export type ApiKeyScope = "server";

export interface ResolvedApiKey {
  key: string | null;
  scope: ApiKeyScope;
}

/**
 * Backend'e giden istekte kullanilacak anahtar: her zaman sunucunun
 * SEARCH_API_KEY'i. Kimlik artik oturumdan geliyor (Google / e-posta);
 * ekip ayni veriyi paylasiyor. Anahtar tarayiciya hicbir zaman gitmiyor.
 */
export function resolveApiKey(_req?: NextRequest): ResolvedApiKey {
  return { key: process.env.SEARCH_API_KEY ?? null, scope: "server" };
}

/**
 * Istegi yapan onayli uye. Oturum yoksa ya da e-posta listeden
 * cikarildiysa null; middleware yalnizca oturumun varligina bakiyor,
 * listeden cikarilma burada (en gec 1 dk onbellek) yakalaniyor.
 */
export async function currentMember(): Promise<(Member & { name: string }) | null> {
  const session = await auth();
  const member = await getMember(session?.user?.email);
  if (!member) return null;
  return { ...member, name: session?.user?.name?.trim() || member.email };
}

export function forbidden(message = "Bu işlem için yetkiniz yok."): NextResponse {
  return NextResponse.json({ message }, { status: 403 });
}

export function unauthorized(): NextResponse {
  return NextResponse.json(
    { message: "Oturumunuz yok ya da erişiminiz kaldırıldı." },
    { status: 401 }
  );
}

/**
 * Backend'e giden kimlik basliklari - hepsi SUNUCUDA uretiliyor, istemcinin
 * gonderdigi hicbir kimlik basligi gecirilmiyor (taklit edilemesin).
 *
 * X-VOLUNTEER-NAME yuzde-kodlu: HTTP basligi Turkce harf tasiyamiyor;
 * backend cozuyor.
 */
function authHeaders(member: Member & { name: string }, admin: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    "X-VOLUNTEER-NAME": encodeURIComponent(member.name.slice(0, 120)),
  };
  const apiKey = resolveApiKey().key;
  if (apiKey) headers["X-API-KEY"] = apiKey;
  if (admin && process.env.ADMIN_API_KEY) headers["X-ADMIN-KEY"] = process.env.ADMIN_API_KEY;
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
  /** Eski cagiranlar icin; yok sayiliyor, anahtar hep sunucununki. */
  apiKey?: string | null;
  /** Yalnizca yoneticiler; backend'e sunucunun ADMIN_API_KEY'i gider. */
  admin?: boolean;
  /**
   * Basarili JSON cevabina eklenecek alanlar. Backend'in bilmedigi ama
   * arayuzun ihtiyac duydugu bilgi icin (orn. anahtarin kime ait oldugu).
   */
  augment?: Record<string, unknown>;
}

/**
 * Backend'e istek atar ve cevabi istemciye uygun sekilde geri dondurur.
 *
 * Hata formati bilincli olarak { message } - adminApi.ts ve api.ts
 * hatalari `error.message` alanindan okuyor.
 */
export async function proxyToBackend(
  req: NextRequest,
  { url, method, body, label, admin = false, augment }: ProxyOptions
): Promise<NextResponse> {
  const member = await currentMember();
  if (!member) return unauthorized();
  if (admin && member.role !== "admin") return forbidden();

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
        ...authHeaders(member, admin),
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

  return passThrough(response, label, augment);
}

/**
 * Backend cevabini istemciye aktarir.
 * CSV gibi JSON olmayan cevaplar govdesi bozulmadan gecer.
 */
async function passThrough(
  response: Response,
  label: string,
  augment?: Record<string, unknown>
): Promise<NextResponse> {
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

  // Ek alanlar yalnizca nesne cevaplara karisiyor; dizi ya da skaler bir
  // govdeye alan eklemek sozlesmeyi bozardi.
  if (augment && data && typeof data === "object" && !Array.isArray(data)) {
    return NextResponse.json({ ...data, ...augment }, { status: response.status });
  }

  return NextResponse.json(data, { status: response.status });
}
