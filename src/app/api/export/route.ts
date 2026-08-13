import { NextRequest, NextResponse } from "next/server";
import { apiUrl, proxyToBackend } from "../../../server/backend";
import type { Place } from "../../../lib/types";

/**
 * /api/export -> backend POST /api/export (CSV doner)
 *
 * Istemci secili Place kayitlarini tam olarak gonderiyor; backend CSV'yi
 * bu kayitlardan uretiyor. Sunucuda ara durum tutulmuyor, bu yuzden
 * arama cache'i dolsa bile export calisir.
 *
 * Place -> backend item cevrimi burada yapiliyor: backend duz lat/lon ve
 * ham OSM etiketleri bekliyor, istemci ise coordinates.lat/lng tutuyor.
 */

export const dynamic = "force-dynamic";

const MAX_ITEMS = 1000;

function toBackendItem(place: Place) {
  return {
    id: place.id,
    name: place.name,
    type: place.type,
    subtype: null,
    lat: place.coordinates?.lat,
    lon: place.coordinates?.lng,
    tags: place.tags ?? {},
  };
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const items: Place[] = body?.items;

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json(
      { message: "Disa aktarilacak kayit secilmedi." },
      { status: 400 }
    );
  }

  if (items.length > MAX_ITEMS) {
    return NextResponse.json(
      { message: `Tek seferde en fazla ${MAX_ITEMS} kayit disa aktarilabilir.` },
      { status: 413 }
    );
  }

  if (!body?.type) {
    return NextResponse.json(
      { message: "Arama tipi (type) zorunlu." },
      { status: 400 }
    );
  }

  return proxyToBackend(req, {
    url: apiUrl("/export"),
    method: "POST",
    label: "export",
    body: {
      type: body.type,
      radius: body.radius ?? 0,
      // Backend {lat, lon} bekliyor; merkez yoksa sifir gonderiyoruz
      // (ExportLog icin kullaniliyor, CSV icerigini etkilemiyor).
      center: {
        lat: body.center?.lat ?? 0,
        lon: body.center?.lon ?? body.center?.lng ?? 0,
      },
      items: items.map(toBackendItem),
    },
  });
}
