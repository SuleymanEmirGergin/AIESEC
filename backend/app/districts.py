"""
Ilce sinir verisi: yukleme, metrik tampon, nokta uyeligi.

Veri kaynagi app/data/districts.geojson — scripts/fetch_districts.py
tarafindan tek seferlik uretiliyor. Runtime'da salt okunur.
"""

import json
import os
from dataclasses import dataclass
from functools import lru_cache
from math import cos, radians
from pathlib import Path

from shapely.affinity import scale
from shapely.geometry import Point, shape
from shapely.geometry.base import BaseGeometry
from shapely.prepared import prep

DATA_PATH = Path(__file__).resolve().parent / "data" / "districts.geojson"

# Enlem derecesi her yerde ayni uzunlukta: ~111320 m.
METERS_PER_DEGREE_LAT = 111320.0

DEFAULT_BUFFER_M = int(os.getenv("DISTRICT_BUFFER_M", "2000"))


@dataclass(frozen=True)
class District:
    """Bir ilcenin geometrisiz metadata'si."""

    id: str
    name: str
    province: str
    province_plate: str
    osm_relation_id: int
    bbox: tuple[float, float, float, float]  # (south, west, north, east)
    center: tuple[float, float]  # (lat, lon)


@lru_cache(maxsize=1)
def raw_geojson() -> dict:
    """districts.geojson'i oldugu gibi dondurur (endpoint bunu servis ediyor)."""
    if not DATA_PATH.exists():
        raise FileNotFoundError(
            f"{DATA_PATH} yok. Once `python scripts/fetch_districts.py` calistir."
        )
    return json.loads(DATA_PATH.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def load_districts() -> dict[str, District]:
    """Kimlik -> District esleme. Dosya bir kez okunur."""
    districts: dict[str, District] = {}
    for feature in raw_geojson()["features"]:
        props = feature["properties"]
        districts[props["id"]] = District(
            id=props["id"],
            name=props["name"],
            province=props["province"],
            province_plate=props["province_plate"],
            osm_relation_id=props["osm_relation_id"],
            bbox=tuple(props["bbox"]),
            center=tuple(props["center"]),
        )
    return districts


def get_district(district_id: str) -> District | None:
    """Kimlikten ilce; bilinmiyorsa None."""
    return load_districts().get(district_id)


def all_districts() -> list[District]:
    """Tum ilceler, il plakasi ve ada gore sirali."""
    return sorted(load_districts().values(), key=lambda d: (d.province_plate, d.name))


def districts_for_province(plate: str) -> list[District]:
    """Bir ildeki ilceler, ada gore sirali."""
    return sorted(
        (d for d in load_districts().values() if d.province_plate == plate),
        key=lambda d: d.name,
    )


@lru_cache(maxsize=256)
def district_geometry(district_id: str) -> BaseGeometry:
    """Ilcenin kesin (tamponsuz) geometrisi."""
    for feature in raw_geojson()["features"]:
        if feature["properties"]["id"] == district_id:
            return shape(feature["geometry"])
    raise KeyError(f"Bilinmeyen ilce: {district_id}")


def buffer_degrees(geom: BaseGeometry, buffer_m: int, ref_lat: float) -> BaseGeometry:
    """
    lat/lon derece uzayinda metrik tampon.

    Dogrudan buffer(buffer_m / 111320) uygulamak yanlis: 1 derece enlem
    her yerde ~111320 m ama 1 derece boylam 111320*cos(lat) m. Turkiye
    enlemlerinde cos(lat) 0.74-0.81, yani bir boylam derecesi bir enlem
    derecesinden daha az gercek mesafeye karsilik gelir. Duzeltilmemis
    (izotropik) bir tampon bu farki gormezden gelir ve dogu-bati
    yonunde gercekte istenenden ~%19-26 DAR kalir: sinira yakin, tamponun
    kapsamasi gereken noktalar yanlislikla disarida sayilir.

    Cozum: boylami (x) cos(lat) ile olcekleyip enlemi (y) oldugu gibi
    birakmak, uzayi yerel olarak izotropik yapar — olcekten sonra hem
    x hem y ekseninde 1 birim ayni gercek mesafeye (~111320 m) karsilik
    gelir. Tamponu bu izotropik uzayda uygula, sonra geri olcekle. Tek
    bir ilce icinde hata %1'in altinda kalir.
    """
    if buffer_m <= 0:
        return geom

    k = cos(radians(ref_lat))
    # shapely x=lon, y=lat: xfact boylami olcekliyor.
    scaled = scale(geom, xfact=k, yfact=1.0, origin=(0.0, 0.0))
    buffered = scaled.buffer(buffer_m / METERS_PER_DEGREE_LAT)
    return scale(buffered, xfact=1.0 / k, yfact=1.0, origin=(0.0, 0.0))


@lru_cache(maxsize=256)
def _prepared_buffered(district_id: str, buffer_m: int):
    """
    Tamponlanmis geometrinin hazirlanmis (prepared) hali.

    prep() nokta testini indeksliyor: ingest sirasinda binlerce nokta
    ayni ilceye karsi test ediliyor, hazirlanmamis geometride bu
    her seferinde tum kenarlari taramak demek.
    """
    district = get_district(district_id)
    if district is None:
        raise KeyError(f"Bilinmeyen ilce: {district_id}")
    geom = district_geometry(district_id)
    return prep(buffer_degrees(geom, buffer_m, district.center[0]))


@lru_cache(maxsize=256)
def _prepared_exact(district_id: str):
    """Kesin geometrinin hazirlanmis hali (is_inside testi icin)."""
    return prep(district_geometry(district_id))


def point_in_geometry(geom: BaseGeometry, lat: float, lon: float) -> bool:
    """Nokta geometri icinde mi? (saf; sentetik geometrilerle test edilebilir)"""
    return bool(geom.contains(Point(lon, lat)))


@lru_cache(maxsize=256)
def expanded_bbox(
    district_id: str, buffer_m: int = DEFAULT_BUFFER_M
) -> tuple[float, float, float, float]:
    """
    Overpass'e gonderilecek bbox: ilce bbox'i + tampon.
    Donus (south, west, north, east) — app.geo.bbox_from_radius ile ayni sira.
    """
    district = get_district(district_id)
    if district is None:
        raise KeyError(f"Bilinmeyen ilce: {district_id}")

    south, west, north, east = district.bbox
    lat_delta = buffer_m / METERS_PER_DEGREE_LAT
    lon_delta = buffer_m / (METERS_PER_DEGREE_LAT * cos(radians(district.center[0])))

    return (
        max(-90.0, south - lat_delta),
        max(-180.0, west - lon_delta),
        min(90.0, north + lat_delta),
        min(180.0, east + lon_delta),
    )


def point_membership(
    district_id: str, lat: float, lon: float, buffer_m: int = DEFAULT_BUFFER_M
) -> bool | None:
    """
    Noktanin BELIRLI bir ilceyle iliskisi.

    Donus: True = kesin sinir ici, False = tampon bolgesi,
    None = bu ilcenin uyesi degil.

    Ingest tek bir ilceyi isliyor ve yalnizca o ilcenin uyeligini
    yaziyor; 80 ilcenin hepsini test edip 79'unu atmak gereksiz.
    """
    south, west, north, east = expanded_bbox(district_id, buffer_m)
    if not (south <= lat <= north and west <= lon <= east):
        return None

    point = Point(lon, lat)
    if not _prepared_buffered(district_id, buffer_m).contains(point):
        return None

    return bool(_prepared_exact(district_id).contains(point))


def districts_for_point(
    lat: float, lon: float, buffer_m: int = DEFAULT_BUFFER_M
) -> list[tuple[str, bool]]:
    """
    Noktanin uyesi oldugu TUM ilceler.

    Donus [(district_id, is_inside), ...]. Bir nokta birden fazla
    ilcenin uyesi olabilir: Kadikoy'un icinde VE Atasehir'in
    tamponunda.

    Ingest bunu kullanmiyor (point_membership yeterli); harita
    merkezinden ilce bulmak gibi ileriki kullanimlar icin duruyor.
    """
    out: list[tuple[str, bool]] = []
    for district_id in load_districts():
        membership = point_membership(district_id, lat, lon, buffer_m)
        if membership is not None:
            out.append((district_id, membership))
    return out
