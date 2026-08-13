import { NextRequest } from "next/server";
import { apiUrl, proxyToBackend } from "../../../server/backend";

/**
 * /api/me -> backend GET /api/me
 *
 * Kullanicinin kendi anahtarinin plan ve kota durumu. Export 'free'
 * planda 403, kota dolunca 429 donuyor; arayuz bunu onceden bilsin diye.
 *
 * Sunucu anahtari bilincli olarak kullanilmiyor: burada sorulan sey
 * "benim anahtarim ne durumda", dolayisiyla yalnizca istemcinin
 * gonderdigi X-API-KEY anlamli. Anahtar yoksa backend 401 donuyor.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return proxyToBackend(req, {
    url: apiUrl("/me"),
    method: "GET",
    label: "me",
  });
}
