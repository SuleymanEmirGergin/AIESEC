import { NextRequest, NextResponse } from "next/server";
import { apiUrl, proxyToBackend, resolveApiKey } from "./backend";

/**
 * Koleksiyon uclari icin ortak proxy (listeler, kayitli yerler).
 *
 * Ikisi de ayni sekle sahip: `/api/x` uzerinde GET+POST, `/api/x/{id}`
 * uzerinde PATCH+DELETE. Bu dosya olmadan ayni sekiz handler iki route
 * dosyasinda kelimesi kelimesine tekrarlanacakti.
 *
 * Kimlik her zaman resolveApiKey uzerinden: kullanicinin kendi anahtari
 * varsa o, yoksa sunucunun anahtari. Ikinci durum urunun varsayilani -
 * ekip anahtar girmeden ayni listeleri paylasiyor.
 */

/** Next 15: dinamik segmentler Promise olarak geliyor. */
interface RouteContext {
  params: Promise<{ path?: string[] }>;
}

async function suffixOf(context: RouteContext): Promise<string> {
  const segments = (await context.params).path ?? [];
  return segments.length ? `/${segments.join("/")}` : "";
}

/** Anahtar yoksa backend'e hic gitmeden anlasilir bir cevap don. */
function missingKeyResponse(): NextResponse {
  return NextResponse.json(
    {
      message:
        "Sunucu anahtari yapilandirilmamis (SEARCH_API_KEY) ve kisisel anahtar da yok.",
    },
    { status: 503 }
  );
}

export function createCollectionRoutes(basePath: string) {
  async function forward(
    req: NextRequest,
    context: RouteContext,
    method: "GET" | "POST" | "PATCH" | "DELETE",
    withBody: boolean
  ) {
    const { key } = resolveApiKey(req);
    if (!key) return missingKeyResponse();

    const suffix = await suffixOf(context);

    // Govdesi olan metotlarda gecersiz JSON'u backend'e tasimak yerine
    // burada kesiyoruz; backend'den donen 422 daha az anlasilir olurdu.
    let body: unknown;
    if (withBody) {
      body = await req.json().catch(() => null);
      if (body === null) {
        return NextResponse.json(
          { message: "Gecersiz istek govdesi." },
          { status: 400 }
        );
      }
    }

    return proxyToBackend(req, {
      url: apiUrl(`${basePath}${suffix}${req.nextUrl.search}`),
      method,
      label: `${basePath.replace("/", "")}${suffix}`,
      apiKey: key,
      ...(withBody ? { body } : {}),
    });
  }

  return {
    GET: (req: NextRequest, context: RouteContext) =>
      forward(req, context, "GET", false),
    POST: (req: NextRequest, context: RouteContext) =>
      forward(req, context, "POST", true),
    PATCH: (req: NextRequest, context: RouteContext) =>
      forward(req, context, "PATCH", true),
    DELETE: (req: NextRequest, context: RouteContext) =>
      forward(req, context, "DELETE", false),
  };
}
