import { NextRequest } from "next/server";
import { apiUrl, proxyToBackend, resolveApiKey } from "../../../../server/backend";

/**
 * /api/districts/* -> backend /api/districts/*
 *
 * Opsiyonel catch-all: `/api/districts` (liste) ile
 * `/api/districts/{id}/places` ayni dosyadan geciyor. Zorunlu
 * catch-all ([...path]) segmentsiz yolu eslestirmedigi icin liste
 * ucu 404 olurdu.
 *
 * Ilce uclari yerel SQLite uzerinde calisiyor; bu proxy yalnizca
 * kimligi tasiyor. Sinir verisi (liste + geojson) backend'de acik,
 * POI donen uclar anahtar istiyor - anahtar yine sunucununkine geri
 * dusuyor, boylece son kullanici anahtar girmeden calisabiliyor.
 */

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { path?: string[] } }
) {
  const segments = params.path ?? [];
  const suffix = segments.length ? `/${segments.join("/")}` : "";
  const { key } = resolveApiKey(req);

  return proxyToBackend(req, {
    url: apiUrl(`/districts${suffix}${req.nextUrl.search}`),
    method: "GET",
    label: `districts${suffix}`,
    apiKey: key,
  });
}
