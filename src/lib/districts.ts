import type { Place, PlaceType } from "./types";

/**
 * Ilce metadata'si ve poligonlarina erisim.
 *
 * Iki veri kumesi de sunucuda uzun sureli onbellekleniyor (metadata 1
 * gun, geojson 1 hafta + immutable). Burada ayrica modul seviyesinde
 * tutuluyor: ayni sekmede ilce degistirmek yeniden istek atmamali.
 */

export interface DistrictMeta {
  id: string;
  name: string;
  province: string;
  province_plate: string;
  /** (south, west, north, east) */
  bbox: [number, number, number, number];
  /** (lat, lon) */
  center: [number, number];
  /** null = hic ingest edilmemis. "cekilmemis" ile "cekilmis ama bos" ayri seyler. */
  fetched_at: string | null;
  place_count: number | null;
  status: "ok" | "partial" | "failed" | null;
}

export interface DistrictPlace {
  id: string;
  name: string | null;
  place_type: PlaceType | null;
  subtype: string | null;
  lat: number;
  lon: number;
  address: string | null;
  confidence: number;
  has_contact: boolean;
  phone: string | null;
  email: string | null;
  website: string | null;
  /** Yalnizca sort=lead_score istendiginde dolu. */
  lead_score: number | null;
}

/**
 * Backend /api/districts/{id}/places yaniti.
 *
 * Alan adlari backend'in dondurduguyle birebir: `results` (sayfadaki
 * kayitlar), `count` (bu sayfadaki adet), `total` (filtreye uyan tum
 * kayitlar), `query` (uygulanan sorgunun yansimasi).
 */
export interface DistrictPlacesResponse {
  results: DistrictPlace[];
  count: number;
  total: number;
  query: Record<string, unknown>;
}

export interface DistrictSummary {
  district_id: string;
  name: string;
  counts: Record<PlaceType, number>;
  total: number;
  fetched_at: string | null;
  place_count: number | null;
  status: "ok" | "partial" | "failed" | null;
}

export type SortOption =
  | "contact_first"
  | "lead_score"
  | "confidence"
  | "name"
  | "ref_distance";

export interface PlaceQuery {
  types?: PlaceType[];
  hasContact?: boolean;
  namedOnly?: boolean;
  minConfidence?: number;
  q?: string;
  includeBuffer?: boolean;
  includeUnclassified?: boolean;
  sort?: SortOption;
  refLat?: number;
  refLon?: number;
  limit?: number;
  offset?: number;
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || `İstek başarısız (HTTP ${response.status})`);
  }
  return response.json();
}

// Modul seviyesinde onbellek: sinir verisi oturum boyunca degismiyor.
let districtsPromise: Promise<DistrictMeta[]> | null = null;
let geojsonPromise: Promise<unknown> | null = null;

/**
 * Ilce listesi. Ilk cagri istegi baslatiyor, sonrakiler ayni promise'i
 * paylasiyor - iki bilesen ayni anda isterse tek istek gidiyor.
 */
export function fetchDistricts(): Promise<DistrictMeta[]> {
  if (!districtsPromise) {
    districtsPromise = getJson<{ districts: DistrictMeta[] }>("/api/districts")
      .then((payload) => payload.districts)
      .catch((error) => {
        // Basarisiz istegi onbellekte birakmak kalici hataya donusurdu.
        districtsPromise = null;
        throw error;
      });
  }
  return districtsPromise;
}

/** Ilce poligonlari (~330 KB). Yalnizca harita katmani istediginde cekiliyor. */
export function fetchDistrictGeojson(): Promise<unknown> {
  if (!geojsonPromise) {
    geojsonPromise = getJson("/api/districts/geojson").catch((error) => {
      geojsonPromise = null;
      throw error;
    });
  }
  return geojsonPromise;
}

/** Ilceleri il bazinda grupla; secici once il, sonra ilce soruyor. */
export function groupByProvince(
  districts: DistrictMeta[]
): { plate: string; province: string; districts: DistrictMeta[] }[] {
  const groups = new Map<string, DistrictMeta[]>();
  for (const district of districts) {
    const existing = groups.get(district.province_plate);
    if (existing) existing.push(district);
    else groups.set(district.province_plate, [district]);
  }

  return Array.from(groups.entries())
    .map(([plate, items]) => ({
      plate,
      province: items[0].province,
      districts: items,
    }))
    .sort((a, b) => a.plate.localeCompare(b.plate));
}

function buildQuery(query: PlaceQuery): string {
  const params = new URLSearchParams();

  if (query.types?.length) params.set("types", query.types.join(","));
  if (query.hasContact) params.set("has_contact", "true");
  if (query.namedOnly) params.set("named_only", "true");
  if (query.minConfidence) params.set("min_confidence", String(query.minConfidence));
  if (query.q?.trim()) params.set("q", query.q.trim());
  // include_buffer varsayilani true; yalnizca kapatildiginda gonderiliyor.
  if (query.includeBuffer === false) params.set("include_buffer", "false");
  if (query.includeUnclassified) params.set("include_unclassified", "true");
  if (query.sort) params.set("sort", query.sort);
  if (query.refLat !== undefined) params.set("ref_lat", String(query.refLat));
  if (query.refLon !== undefined) params.set("ref_lon", String(query.refLon));
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.offset) params.set("offset", String(query.offset));

  const raw = params.toString();
  return raw ? `?${raw}` : "";
}

export function fetchDistrictPlaces(
  districtId: string,
  query: PlaceQuery = {},
  signal?: AbortSignal
): Promise<DistrictPlacesResponse> {
  return getJson<DistrictPlacesResponse>(
    `/api/districts/${districtId}/places${buildQuery(query)}`,
    signal
  );
}

export function fetchDistrictSummary(
  districtId: string,
  includeBuffer = true,
  signal?: AbortSignal
): Promise<DistrictSummary> {
  const suffix = includeBuffer ? "" : "?include_buffer=false";
  return getJson<DistrictSummary>(
    `/api/districts/${districtId}/summary${suffix}`,
    signal
  );
}

/**
 * Turkce arama katlamasi: aksanli harfleri ASCII karsiligina indirger.
 *
 * Neden gerekli: "Kadikoy".toLocaleLowerCase("tr") noktasiz "ı" uretiyor,
 * kullanici ise ASCII klavyeyle "kadik" yaziyor ve `includes` eslesmiyor.
 * Ayni sey Sile/Silivri (s/ş), Cerkezkoy (c/ç), Gungoren (g/ğ, u/ü) icin
 * de gecerli. Kullanici ilce adini tam aksanlariyla yazmak zorunda
 * kalmamali.
 *
 * Backend'deki tr_fold ile ayni sinifta bir sorun; orada "İ".casefold()
 * birlesik nokta uretiyordu.
 */
/**
 * Ilce sorgusundan donen kaydi arama sonucu seklindeki `Place`e cevirir.
 *
 * Iki arama yolu var (haritadan bbox taramasi ve ilce bazli yerel sorgu)
 * ama harita, sonuc listesi, kaydetme ve CSV disa aktarimi tek bir sekil
 * biliyor. Cevrim burada, tipin sahibinin yaninda duruyor; her cagiranin
 * kendi seklini uydurmasi ikisinin sessizce ayrismasi demekti.
 *
 * Iletisim alanlari `tags` icine yaziliyor cunku ContactLinks ve CSV
 * uretici ham OSM etiket semasini okuyor.
 */
export function districtPlaceToPlace(place: DistrictPlace): Place {
  const tags: Record<string, string> = {};
  if (place.phone) tags.phone = place.phone;
  if (place.email) tags.email = place.email;
  if (place.website) tags.website = place.website;

  return {
    id: place.id,
    name: place.name || "İsimsiz Yer",
    type: (place.place_type ?? "factory") as PlaceType,
    coordinates: { lat: place.lat, lng: place.lon },
    address: place.address || "Adres bilgisi yok",
    tags,
  };
}

export function foldTr(text: string): string {
  return text
    .replace(/İ/g, "i")
    .replace(/I/g, "i")
    .replace(/ı/g, "i")
    .replace(/Ş/g, "s")
    .replace(/ş/g, "s")
    .replace(/Ğ/g, "g")
    .replace(/ğ/g, "g")
    .replace(/Ü/g, "u")
    .replace(/ü/g, "u")
    .replace(/Ö/g, "o")
    .replace(/ö/g, "o")
    .replace(/Ç/g, "c")
    .replace(/ç/g, "c")
    .toLowerCase();
}

/** Verisi 30 gunden eskiyse arayuz tazeleme hatirlatmasi gosteriyor. */
export const STALE_AFTER_DAYS = 30;

export function ageInDays(fetchedAt: string | null): number | null {
  if (!fetchedAt) return null;
  const then = new Date(fetchedAt).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / 86_400_000);
}
