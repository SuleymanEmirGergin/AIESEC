import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "../../../server/rateLimit";
import { apiUrl } from "../../../server/backend";
import CacheService from "../../../server/cache";
import crypto from "crypto";
import type { Place } from "../../../lib/types";

/**
 * /api/search -> backend GET /api/search
 *
 * Onceden bu route dogrudan Overpass'e gidiyordu. Artik backend'e
 * yonlendiriyor: Turkce okul siniflandirmasi (ilkokul/ortaokul/lise),
 * override'lar, guven skoru ve politika motoru orada yasiyor. Dogrudan
 * Overpass yolu `isced:level` etiketine dayaniyordu ve Turkiye'de bu
 * etiket seyrek oldugu icin okul aramalari cogunlukla bos donuyordu.
 *
 * Iki sozlesme farkini burada kapatiyoruz:
 *  1. Istemci bbox gonderiyor, backend merkez + yaricap bekliyor.
 *  2. Backend duz lat/lon donuyor, istemci coordinates{lat,lng} bekliyor.
 */

export const dynamic = "force-dynamic";

/** Backend'in kabul ettigi ust sinir (free planda 2000, orada zorlanir). */
const MAX_RADIUS_M = 5000;
const CACHE_TTL_S = 600;

/** Iki nokta arasi mesafe (metre). Yaricabi bbox'tan turetmek icin. */
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Backend'in Place semasini istemcinin bekledigi sekle cevirir. */
function toClientPlace(item: any): Place {
  return {
    id: item.id,
    name: item.name || "İsimsiz Yer",
    type: item.type,
    coordinates: { lat: item.lat, lng: item.lon },
    address: item.address || "Adres bilgisi yok",
    distance_m: item.distance_m ?? item.distance ?? undefined,
    confidence_score: item.confidence_score ?? undefined,
    tags: item.tags ?? {},
  };
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
    const rl = await rateLimit(ip);
    if (!rl.success) {
      return NextResponse.json({ message: "Rate limit exceeded" }, { status: 429 });
    }

    const body = await req.json().catch(() => null);
    const { bbox, category, limit = 250 } = body ?? {};

    if (!Array.isArray(bbox) || bbox.length !== 4) {
      return NextResponse.json({ message: "Gecersiz bbox" }, { status: 400 });
    }
    if (!category) {
      return NextResponse.json({ message: "Kategori zorunlu" }, { status: 400 });
    }

    // bbox = [minLon, minLat, maxLon, maxLat] (MapView bu sirayla yayiyor)
    const [minLon, minLat, maxLon, maxLat] = bbox as number[];
    const centerLat = (minLat + maxLat) / 2;
    const centerLon = (minLon + maxLon) / 2;

    // Viewport'u tamamen kapsayan yaricap = merkezden koseye mesafe.
    const viewportRadius = Math.round(
      haversine(centerLat, centerLon, maxLat, maxLon)
    );
    const radius = Math.min(viewportRadius, MAX_RADIUS_M);
    const clamped = viewportRadius > MAX_RADIUS_M;

    // Kimlik: kullanicinin kendi anahtari varsa o, yoksa sunucunun anahtari.
    // Boylece son kullanici anahtar girmeden arama yapabiliyor.
    const apiKey = req.headers.get("x-api-key") || process.env.SEARCH_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          message:
            "Arama icin API anahtari yapilandirilmamis (SEARCH_API_KEY).",
        },
        { status: 503 }
      );
    }

    const cacheKey =
      "search:" +
      crypto
        .createHash("md5")
        .update(JSON.stringify({ centerLat, centerLon, radius, category, limit }))
        .digest("hex");

    const cached = await CacheService.get<any>(cacheKey);
    if (cached) {
      return NextResponse.json(
        { ...cached, meta: { ...cached.meta, cached: true } },
        { headers: { "X-Cache": "HIT" } }
      );
    }

    const query = new URLSearchParams({
      lat: String(centerLat),
      lon: String(centerLon),
      radius: String(radius),
      type: category,
      limit: String(Math.min(Number(limit) || 250, 1000)),
    });

    const url = apiUrl(`/search?${query.toString()}`);
    if (!url) {
      return NextResponse.json(
        { message: "NEXT_PUBLIC_API_BASE tanimli degil." },
        { status: 503 }
      );
    }

    const upstream = await fetch(url, {
      headers: { "X-API-KEY": apiKey },
      cache: "no-store",
    });

    if (!upstream.ok) {
      const detail = await upstream
        .json()
        .then((d) => (typeof d?.detail === "string" ? d.detail : null))
        .catch(() => null);
      return NextResponse.json(
        { message: detail || `Arama basarisiz (HTTP ${upstream.status})` },
        { status: upstream.status }
      );
    }

    const data = await upstream.json();
    const places = (data.results ?? []).map(toClientPlace);

    const payload = {
      success: true,
      data: places,
      total: data.count ?? places.length,
      meta: {
        cached: false,
        provider: "backend",
        radiusUsed: radius,
        viewportRadius,
        // Istemci bunu ust seritte kullaniciya gosteriyor: harita
        // cok genisse kenarlardaki yerler sonuca girmiyor.
        radiusClamped: clamped,
      },
    };

    await CacheService.set(cacheKey, payload, CACHE_TTL_S);

    return NextResponse.json(payload, { headers: { "X-Cache": "MISS" } });
  } catch (error: any) {
    console.error("[search] hata:", error?.message);
    return NextResponse.json(
      { message: error?.message || "Arama sirasinda beklenmeyen hata" },
      { status: 500 }
    );
  }
}
