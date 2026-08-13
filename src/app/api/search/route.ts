import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "../../../server/rateLimit";
import { apiUrl, resolveApiKey } from "../../../server/backend";
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

/**
 * Backend'in kullandigi izgara adimi (app/geo.py: snap_bbox_outward).
 * Ayni deger olmali; onbellek anahtari bu varsayima dayaniyor.
 */
const GRID_DEG = 0.01;

/**
 * Bbox'i izgaraya disari dogru oturtur - backend'deki snap_bbox_outward
 * ile ayni kural.
 *
 * Yalnizca ONBELLEK ANAHTARI icin kullaniliyor; backend'e gonderilen
 * bbox ham (kirpilmis) haliyle gidiyor. Ayrim onemli: backend plan
 * kontrolunu aldigi bbox uzerinden yapiyor, snap'lenmis bir kutu
 * gondermek sinira yakin istekleri gereksiz yere 403'e dusururdu.
 *
 * Anahtari snap'lenmis kutudan uretmek dogru, cunku backend de ayni
 * izgaraya oturtuyor: ayni snap'e dusen iki viewport backend'de
 * birebir ayni sorguyu ve ayni sonucu uretiyor, dolayisiyla onbellek
 * girdisini paylasmalari gerekiyor. Onceden anahtar ham koordinatlardan
 * uretildigi icin 1 piksel pan bile yeni anahtar demekti ve Redis
 * katmani panlamada neredeyse hic isabet etmiyordu.
 */
function snapKeyBox(minLon: number, minLat: number, maxLon: number, maxLat: number) {
  return [
    Math.floor(minLon / GRID_DEG) * GRID_DEG,
    Math.floor(minLat / GRID_DEG) * GRID_DEG,
    Math.ceil(maxLon / GRID_DEG) * GRID_DEG,
    Math.ceil(maxLat / GRID_DEG) * GRID_DEG,
  ].map((c) => c.toFixed(2));
}

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
    // Backend plan sinirini yaricap uzerinden uyguluyor, o yuzden bbox
    // gonderirken de bu deger belirleyici.
    const viewportRadius = Math.round(
      haversine(centerLat, centerLon, maxLat, maxLon)
    );
    const radius = Math.min(viewportRadius, MAX_RADIUS_M);
    const clamped = viewportRadius > MAX_RADIUS_M;

    // Sinir asiliyorsa bbox'i merkezine dogru kucultuyoruz; en-boy orani
    // korunuyor. Alternatif backend'in 403 donmesiydi, ama bu calisan bir
    // aramayi hataya cevirirdi: mevcut davranis merkez cevresini tarayip
    // kullaniciyi uyarmak.
    // %2 pay: burada ve backend'de yaricap ayri ayri hesaplaniyor ve
    // yuvarlama farki birkac metre olabiliyor. Tam sinira nisan almak,
    // sinirin 2 m ustune tasan bir istegin 403 almasi demekti.
    const shrink = clamped ? (MAX_RADIUS_M * 0.98) / viewportRadius : 1;
    const halfLat = ((maxLat - minLat) / 2) * shrink;
    const halfLon = ((maxLon - minLon) / 2) * shrink;

    // Backend GeoJSON sirasi bekliyor: minLon,minLat,maxLon,maxLat
    const effectiveBbox = [
      centerLon - halfLon,
      centerLat - halfLat,
      centerLon + halfLon,
      centerLat + halfLat,
    ].map((c) => c.toFixed(6));

    // Kimlik: kullanicinin kendi anahtari varsa o, yoksa sunucunun anahtari.
    // Ayni kural /api/export ve /api/me icin de gecerli; kurali tek yerde
    // tutmak icin resolveApiKey kullaniliyor.
    const { key: apiKey } = resolveApiKey(req);
    if (!apiKey) {
      return NextResponse.json(
        {
          message:
            "Arama icin API anahtari yapilandirilmamis (SEARCH_API_KEY).",
        },
        { status: 503 }
      );
    }

    // Anahtar izgaraya oturtulmus kutudan: haritayi birkac piksel
    // kaydirmak ayni anahtari vermeli. Ham koordinatlarla anahtar
    // uretmek her pan hareketinde Redis'i isabetsiz birakiyordu.
    const keyBox = snapKeyBox(
      Number(effectiveBbox[0]),
      Number(effectiveBbox[1]),
      Number(effectiveBbox[2]),
      Number(effectiveBbox[3])
    );
    const cacheKey =
      "search:" +
      crypto
        .createHash("md5")
        .update(JSON.stringify({ bbox: keyBox, category, limit }))
        .digest("hex");

    const cached = await CacheService.get<any>(cacheKey);
    if (cached) {
      return NextResponse.json(
        { ...cached, meta: { ...cached.meta, cached: true } },
        { headers: { "X-Cache": "HIT" } }
      );
    }

    // radius yerine bbox: uc, viewport'u daireye cevirmeden tam olarak
    // bu dikdortgeni tariyor. Cember yolu, kullanicinin gordugu alanin
    // zoom'a gore 2-2.6 katini taratiyordu.
    // lat/lon yine gerekiyor: mesafe hesabi ve siralama merkeze gore.
    const query = new URLSearchParams({
      lat: String(centerLat),
      lon: String(centerLon),
      bbox: effectiveBbox.join(","),
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
        // Esdeger yaricap: gercekte taranan sey dikdortgen, ama plan
        // siniri ve kullaniciya gosterilen mesafe yaricap cinsinden.
        radiusUsed: radius,
        viewportRadius,
        // Istemci bunu ust seritte kullaniciya gosteriyor: harita
        // cok genisse kenarlardaki yerler sonuca girmiyor.
        radiusClamped: clamped,
        // Gercekte taranan dikdortgen; hata ayiklamayi kolaylastiriyor.
        bboxUsed: effectiveBbox.join(","),
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
