import { NextRequest } from "next/server";
import { proxyToBackend, rootUrl } from "../../../../server/backend";

/**
 * /api/admin/reports (liste) -> backend GET /admin/reports
 *
 * Bu dosya [...path] catch-all'undan once eslesir (statik segment
 * dinamikten onceliklidir). Tekil rapor islemleri (/reports/{id}, PATCH)
 * catch-all uzerinden gitmeye devam eder.
 *
 * Geriye kalan tek uyusmazlik sayfa numarasi: istemci `page` gonderiyor,
 * backend `offset` bekliyor. Toplam kayit sayisi artik backend'den
 * geliyor (COUNT sorgusu); onceden burada tahmin ediliyordu ve toplam
 * sayfa sayisi gercek degildi.
 */

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 10;

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;

  const limit = Number(params.get("limit")) || DEFAULT_LIMIT;
  const page = Math.max(1, Number(params.get("page")) || 1);

  const query = new URLSearchParams({
    limit: String(limit),
    offset: String((page - 1) * limit),
    // "all" backend tarafinda destekleniyor; parametreyi atlamak
    // sessizce "open" filtresine dusmek demekti.
    status: params.get("status") || "open",
  });

  return proxyToBackend(req, {
    url: rootUrl(`/admin/reports?${query.toString()}`),
    method: "GET",
    label: "admin/reports",
  });
}
