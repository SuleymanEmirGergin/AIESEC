"""
Ilce sinir verisi uretimi. Tek seferlik calistirilir, cikti git'e girer.

Neden iki farkli servis:
  - Overpass ilce relation'larinin ID ve adini guvenilir sekilde veriyor,
    ama geometriyi `members` olarak donuyor. Bunlari kapali ringlere
    birlestirmek (way stitching) hataya acik bir is.
  - Nominatim /lookup relation ID karsiliginda hazir GeoJSON poligon
    donuyor ve istek basina 50 ID kabul ediyor. 80 ilce = 2 istek.

Kullanim:
    cd backend && python scripts/fetch_districts.py
"""

import asyncio
import json
import re
import sys
from pathlib import Path

import httpx
from shapely.geometry import mapping, shape
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

OUTPUT_PATH = Path(__file__).resolve().parents[1] / "app" / "data" / "districts.geojson"

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
NOMINATIM_LOOKUP_URL = "https://nominatim.openstreetmap.org/lookup"
NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search"

# Nominatim kullanim politikasi kendini tanitan bir User-Agent zorunlu
# kiliyor; olmadan istekler 403 ile reddediliyor.
USER_AGENT = "nearby-place-finder/1.0 (district boundary import)"

# Poligon basitlestirme toleransi (derece). ~0.001 derece ~ 100 m.
# Dogruluk kaygisi yok: 2 km'lik arama tamponu 100 m'lik sinir sapmasini
# yutuyor, o yuzden tek basitlestirilmis kopya hem harita cizimi hem
# sunucu filtresi icin yeterli.
SIMPLIFY_TOLERANCE = 0.001

# Kapsam. Plaka kodu ilce kimliginin parcasi.
PROVINCES = [
    {"slug": "istanbul", "plate": "34", "name": "İstanbul", "expected": 39},
    {"slug": "edirne", "plate": "22", "name": "Edirne", "expected": 9},
    {"slug": "tekirdag", "plate": "59", "name": "Tekirdağ", "expected": 11},
    {"slug": "kirklareli", "plate": "39", "name": "Kırklareli", "expected": 8},
    {"slug": "malatya", "plate": "44", "name": "Malatya", "expected": 13},
]

_TR_MAP = str.maketrans({
    "ç": "c", "Ç": "c", "ğ": "g", "Ğ": "g", "ı": "i", "I": "i",
    "İ": "i", "i": "i", "ö": "o", "Ö": "o", "ş": "s", "Ş": "s",
    "ü": "u", "Ü": "u", "â": "a", "î": "i", "û": "u",
})


def tr_slug(text: str) -> str:
    """Turkce metni ASCII slug'a cevirir: 'Kadıköy' -> 'kadikoy'."""
    folded = (text or "").translate(_TR_MAP).lower()
    folded = re.sub(r"[^a-z0-9]+", "-", folded)
    return folded.strip("-")


def district_id(province_plate: str, province_slug: str, district_name: str) -> str:
    """
    Ilce kimligi: tr-{plaka}-{slug}.

    OSM'de bazi merkez ilceler "Merkez" olarak geciyor (Edirne, Kirklareli).
    'tr-39-merkez' teknik olarak calisir ama okunmuyor; bu durumda il
    slug'ina dusuluyor.
    """
    slug = tr_slug(district_name)
    if slug in ("merkez", ""):
        slug = province_slug
    return f"tr-{province_plate}-{slug}"


def parse_district_relations(
    overpass_json: dict, province: str, plate: str
) -> list[dict]:
    """Overpass cevabindan ilce metadata'sini cikarir (geometri yok)."""
    province_slug = tr_slug(province)
    out = []
    for el in overpass_json.get("elements", []):
        if el.get("type") != "relation":
            continue
        name = (el.get("tags") or {}).get("name")
        if not name:
            continue
        out.append({
            "id": district_id(plate, province_slug, name),
            "name": name,
            "province": province,
            "province_plate": plate,
            "osm_relation_id": el["id"],
        })
    return out


def attach_geometry(
    metas: list[dict], lookup_json: list[dict], tolerance: float
) -> list[dict]:
    """
    Nominatim /lookup ciktisindaki geometriyi metadata ile eslestirir,
    basitlestirir, bbox ve merkez hesaplar.

    Geometrisi bulunamayan ilce icin ValueError firlatir: sessizce eksik
    veri uretmek en kotu sonuc olur, cunku o ilce arayuzde tiklanabilir
    gorunup hicbir zaman sonuc vermez.
    """
    by_relation = {
        item["osm_id"]: item["geojson"]
        for item in lookup_json
        if item.get("osm_type") == "relation" and item.get("geojson")
    }

    out = []
    for meta in metas:
        raw = by_relation.get(meta["osm_relation_id"])
        if not raw:
            raise ValueError(
                f"{meta['id']} ({meta['name']}) icin geometri bulunamadi; "
                f"relation {meta['osm_relation_id']}"
            )

        geom = shape(raw).simplify(tolerance, preserve_topology=True)
        if geom.is_empty:
            raise ValueError(f"{meta['id']} basitlestirmeden sonra bos kaldi")

        minx, miny, maxx, maxy = geom.bounds  # (lon, lat) sirasi
        centroid = geom.centroid

        out.append({
            **meta,
            "geometry": mapping(geom),
            # bbox (south, west, north, east) — geo.bbox_from_radius ile ayni sira
            "bbox": (miny, minx, maxy, maxx),
            "center": (centroid.y, centroid.x),
        })
    return out


def build_feature_collection(districts: list[dict]) -> dict:
    """GeoJSON FeatureCollection uretir."""
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": d["geometry"],
                "properties": {
                    "id": d["id"],
                    "name": d["name"],
                    "province": d["province"],
                    "province_plate": d["province_plate"],
                    "osm_relation_id": d["osm_relation_id"],
                    "bbox": list(d["bbox"]),
                    "center": list(d["center"]),
                },
            }
            for d in districts
        ],
    }


def _overpass_query(province_name: str) -> str:
    """Bir ildeki admin_level=6 ilce relation'larini ister (geometri yok)."""
    return f"""[out:json][timeout:120];
area["name"="{province_name}"]["admin_level"="4"]->.il;
rel(area.il)["admin_level"="6"]["boundary"="administrative"];
out tags;"""


def _is_transient_http_error(exc: BaseException) -> bool:
    """
    429 (rate limit) ve 5xx (sunucu/gateway) gecici sayilir ve yeniden
    denenir; digerleri (orn. 400 sorgu hatasi) hemen patlar. Overpass'in
    paylasilan public sunucusu olcumde ikisini de urettigi icin ayrim
    onemli (app/overpass.py'deki OverpassTransientError ile ayni mantik).
    """
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code == 429 or exc.response.status_code >= 500
    return isinstance(exc, httpx.RequestError)


# Mirror'suz tek endpoint'e karsi bekleme app/overpass.py'den daha uzun:
# orada backoff kisa cunku basarisizlikta baska bir aynaya geciliyor. Burada
# tek adres var, o yuzden 429'un sunucu tarafindaki soguma suresini
# gercekten bekleyip gecirmek gerekiyor.
_retry_transient = retry(
    stop=stop_after_attempt(4),
    wait=wait_exponential(multiplier=3, min=5, max=60),
    retry=retry_if_exception(_is_transient_http_error),
    reraise=True,
)


@_retry_transient
async def _query_overpass(client: httpx.AsyncClient, province_name: str) -> dict:
    """Tek bir ile ait Overpass sorgusu calistirir."""
    response = await client.post(
        OVERPASS_URL,
        data={"data": _overpass_query(province_name)},
        headers={"User-Agent": USER_AGENT},
        timeout=180.0,
    )
    response.raise_for_status()
    return response.json()


async def _fetch_relations(client: httpx.AsyncClient) -> list[dict]:
    """5 il icin Overpass'ten metadata cek, sirayla (es zamanli slot 2)."""
    metas: list[dict] = []
    for province in PROVINCES:
        print(f"[OVERPASS] {province['name']} ilceleri...")
        overpass_json = await _query_overpass(client, province["name"])
        parsed = parse_district_relations(
            overpass_json, province["slug"], province["plate"]
        )
        if len(parsed) != province["expected"]:
            raise ValueError(
                f"{province['name']}: {province['expected']} ilce beklendi, "
                f"{len(parsed)} bulundu. OSM verisi degismis olabilir; "
                f"PROVINCES icindeki 'expected' degerini kontrol et."
            )
        print(f"[OVERPASS] {province['name']}: {len(parsed)} ilce")
        metas.extend(parsed)
        # Ardisik il sorgulari arasinda kisa bekleme: paylasilan sunucu
        # bosluksuz art arda isteklerde 429 donebiliyor (olcumde gozlendi).
        await asyncio.sleep(2.0)
    return metas


@_retry_transient
async def _query_nominatim_lookup(
    client: httpx.AsyncClient, osm_ids: str
) -> list[dict]:
    """Nominatim /lookup ile bir grup (<=50) relation'in geometrisini ceker."""
    response = await client.get(
        NOMINATIM_LOOKUP_URL,
        params={"osm_ids": osm_ids, "format": "json", "polygon_geojson": "1"},
        headers={"User-Agent": USER_AGENT},
        timeout=180.0,
    )
    response.raise_for_status()
    return response.json()


async def _fetch_geometries(
    client: httpx.AsyncClient, metas: list[dict]
) -> list[dict]:
    """Nominatim /lookup ile geometri cek. Istek basina en fazla 50 ID."""
    results: list[dict] = []
    for i in range(0, len(metas), 50):
        chunk = metas[i : i + 50]
        osm_ids = ",".join(f"R{m['osm_relation_id']}" for m in chunk)
        print(f"[NOMINATIM] {len(chunk)} ilce geometrisi...")
        results.extend(await _query_nominatim_lookup(client, osm_ids))
        # Nominatim kullanim politikasi 1 istek/saniye siniri koyuyor.
        await asyncio.sleep(1.2)
    return results


@_retry_transient
async def _query_nominatim_search(
    client: httpx.AsyncClient, meta: dict
) -> list[dict]:
    """Tek bir ilce icin Nominatim /search adaylarini ceker."""
    response = await client.get(
        NOMINATIM_SEARCH_URL,
        params={
            "q": f"{meta['name']}, {meta['province']}, Türkiye",
            "format": "json",
            "polygon_geojson": "1",
            "limit": 5,
        },
        headers={"User-Agent": USER_AGENT},
        timeout=180.0,
    )
    response.raise_for_status()
    return response.json()


async def _fetch_geometries_by_search(
    client: httpx.AsyncClient, metas: list[dict]
) -> list[dict]:
    """
    Yedek yol: /lookup geometri dondurmedigi durumda ilce basina /search.

    Ada eslestirmesine guvenilmiyor (OSM adlandirmasi tutarsiz olabiliyor);
    adaylar arasindan osm_id relation ID'sine esit olan seciliyor.
    """
    results: list[dict] = []
    for meta in metas:
        print(f"[NOMINATIM] {meta['name']} ({meta['province']}) araniyor...")
        candidates = await _query_nominatim_search(client, meta)
        match = next(
            (c for c in candidates if c.get("osm_id") == meta["osm_relation_id"]),
            None,
        )
        if match:
            results.append(match)
        # Nominatim kullanim politikasi 1 istek/saniye siniri koyuyor.
        await asyncio.sleep(1.2)
    return results


async def main() -> int:
    async with httpx.AsyncClient() as client:
        metas = await _fetch_relations(client)
        lookup = await _fetch_geometries(client, metas)

        # /lookup bazi relation'lar icin geojson dondurmeyebiliyor; boyle
        # kalanlar icin ilce basina /search'e dusuluyor.
        found_ids = {
            item["osm_id"]
            for item in lookup
            if item.get("osm_type") == "relation" and item.get("geojson")
        }
        missing = [m for m in metas if m["osm_relation_id"] not in found_ids]
        if missing:
            print(f"[NOMINATIM] {len(missing)} ilce /lookup ile bulunamadi, /search "
                  "deneniyor...")
            lookup.extend(await _fetch_geometries_by_search(client, missing))

    districts = attach_geometry(metas, lookup, SIMPLIFY_TOLERANCE)
    feature_collection = build_feature_collection(districts)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(feature_collection, ensure_ascii=False), encoding="utf-8"
    )

    size_kb = OUTPUT_PATH.stat().st_size / 1024
    print(f"[OK] {len(districts)} ilce -> {OUTPUT_PATH} ({size_kb:.0f} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
