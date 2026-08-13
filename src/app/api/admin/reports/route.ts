import { NextRequest, NextResponse } from "next/server";
import { proxyToBackend, rootUrl } from "../../../../server/backend";

/**
 * /api/admin/reports (liste) -> backend GET /admin/reports
 *
 * Bu dosya [...path] catch-all'undan once eslesir (statik segment
 * dinamikten onceliklidir). Tekil rapor islemleri (/reports/{id}, PATCH)
 * catch-all uzerinden gitmeye devam eder.
 *
 * Iki uyusmazligi burada kapatiyoruz:
 *  1. Istemci `page` gonderiyor, backend `offset` bekliyor.
 *  2. Istemci { data, total } bekliyor, backend duz dizi donuyor.
 *
 * Backend toplam kayit sayisi vermedigi icin `total` YAKLASIKTIR:
 * dolu bir sayfa geldiginde "en az bir sayfa daha var" varsayilir.
 * Ileri/geri gezinme dogru calisir; toplam sayfa sayisi gercek degildir.
 * Kesin sayi istenirse backend /admin/reports'a COUNT eklenmelidir.
 */

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 10;

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;

  const limit = Number(params.get("limit")) || DEFAULT_LIMIT;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const offset = (page - 1) * limit;

  const query = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });

  // Istemci "all" gonderebiliyor; backend tek bir status bekledigi icin
  // yalnizca gercek bir durum filtresi varsa iletiliyor.
  const status = params.get("status");
  if (status && status !== "all") query.set("status", status);

  const url = rootUrl(`/admin/reports?${query.toString()}`);
  const response = await proxyToBackend(req, {
    url,
    method: "GET",
    label: "admin/reports",
  });

  if (!response.ok) return response;

  const items = await response.json().catch(() => []);
  const list = Array.isArray(items) ? items : [];

  return NextResponse.json({
    data: list,
    // Dolu sayfa -> sonraki sayfanin var oldugunu isaretle.
    total: offset + list.length + (list.length === limit ? 1 : 0),
  });
}
