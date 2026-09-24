"""
Overture Maps `places` temasindan POI cekme.

Neden bu kaynak: OSM'de iletisim bilgisi seyrek (olculdu: telefon %9.2,
website %7.6). Overture'da ayni bolgede telefon orani %56.7 cikti.
Ustelik Overture places temasi OSM materyalini DISLIYOR, yani elimizdeki
veriyle cakismiyor -- tamamliyor.

Lisans: CDLA Permissive 2.0 / Apache 2.0. Google ve Yandex'in aksine
kalici saklama, veritabaninda tutma ve disa aktarma kisiti YOK. Bu urun
kalici bir lead veritabani tutup CSV urettigi icin belirleyici olan
buydu.

Erisim: veri S3'te GeoParquet olarak duruyor; DuckDB uzaktan sorguluyor,
indirme gerekmiyor. Bbox filtresi parquet'in satir grubu istatistikleri
sayesinde taranan veriyi kucultuyor (ilce boyutunda bbox ~15 sn).
"""

import logging
import os
from typing import Any, Optional

logger = logging.getLogger(__name__)

# Surum sabit tutuluyor: Overture ayda bir yeni surum yayinliyor ve
# "latest" diye bir yol yok. Yukseltmek bilincli bir karar olmali,
# cunku kategoriler ve id'ler surumler arasi degisebiliyor.
OVERTURE_RELEASE = os.getenv("OVERTURE_RELEASE", "2026-07-22.0")
OVERTURE_S3 = (
    f"s3://overturemaps-us-west-2/release/{OVERTURE_RELEASE}/theme=places/type=place/*"
)

# Overture kategorisi -> bizim PlaceType.
#
# Overture'da ~2300 kategori var; yalnizca taksonomimize karsilik
# gelenler aliniyor. Eslesmeyen kategoriler bilincli olarak disarida:
# amac genel bir POI veritabani degil, staj/degisim icin kurum listesi.
CATEGORY_MAP: dict[str, str] = {
    # Egitim
    "preschool": "kindergarten",
    "kindergarten": "kindergarten",
    "elementary_school": "primary_school",
    "primary_school": "primary_school",
    "middle_school": "middle_school",
    "high_school": "high_school",
    "private_school": "private_school",
    "college_university": "college_university",
    "university": "college_university",
    "community_college": "college_university",
    # Isletme
    "business_manufacturing_and_supply": "factory",
    "manufacturing": "factory",
    "factory": "factory",
    "industrial_company": "factory",
    "office": "office",
    "professional_services": "office",
    "workshop": "workshop",
    "repair_shop": "workshop",
    # Sirket: kurumsal ofis. `*_company` soneki classify_overture'da
    # toptan yakalaniyor (information_technology_company vb.).
    "corporate_office": "company",
    "business": "company",
    "business_to_business": "company",
    "business_to_business_services": "company",
    # Hizmet
    "hotel": "hotel",
    "accommodation": "hotel",
    "hostel": "hotel",
    "motel": "hotel",
    "resort": "hotel",
    "lodge": "hotel",
    "bed_and_breakfast": "hotel",
    "real_estate": "real_estate",
    "real_estate_agent": "real_estate",
    "real_estate_service": "real_estate",
    "property_management": "real_estate",
    "commercial_real_estate": "real_estate",
    "language_school": "language_school",
    "tutoring_center": "language_school",
    "travel_services": "travel_agency",
    "travel_agents": "travel_agency",
    "travel_company": "travel_agency",
    "tours": "travel_agency",
    "sightseeing_tour_agency": "travel_agency",
    # Gezi & eglence. `*_museum` soneki classify_overture'da toptan.
    "aquarium": "zoo_aquarium",
    "zoo": "zoo_aquarium",
    "petting_zoo": "zoo_aquarium",
    "wildlife_sanctuary": "zoo_aquarium",
    "amusement_park": "theme_park",
    "theme_park": "theme_park",
    "water_park": "theme_park",
    "museum": "museum",
    "planetarium": "museum",
    "botanical_garden": "botanical_garden",
    "national_park": "nature_park",
    "nature_reserve": "nature_park",
}


def classify_overture(category: str | None, name: str | None) -> str | None:
    """Overture kategorisi + ad -> PlaceType. Holding ad kuralidir."""
    from app.classify import is_holding_name

    if is_holding_name(name or ""):
        return "holding"
    # Idari alanlar ("Antalya Province") kategori hatasiyla muze/park
    # olarak geliyor; kurum degil, atla.
    if (name or "").strip().lower().endswith(" province"):
        return None
    mapped = CATEGORY_MAP.get(category or "")
    if mapped:
        return mapped
    if category and category.endswith("_company"):
        return "company"
    if category and category.endswith("_museum"):
        return "museum"
    return None


def _first(value: Any) -> Optional[str]:
    """
    Overture'da phones/websites/emails DIZI. Ilk dolu degeri aliyoruz.

    Tumunu saklamak cazip ama liste PlaceRow'un tek degerli kolonlarina
    sigmiyor; ham hali `tags_json` icinde duruyor, gerekirse oradan
    cikarilabilir.
    """
    if not value:
        return None
    if isinstance(value, (list, tuple)):
        for item in value:
            if item:
                return str(item)
        return None
    return str(value) or None


def fetch_places(
    bbox: tuple[float, float, float, float],
    only_mapped: bool = True,
) -> list[dict]:
    """
    Bbox icindeki Overture yerlerini dondurur.

    bbox: (south, west, north, east) -- ingest.py'deki sirayla ayni.

    only_mapped=True iken yalnizca CATEGORY_MAP'te karsiligi olan
    kategoriler geliyor. False, zenginlestirme icin daha genis bir
    havuz istendiginde kullanilir: mevcut bir kaydin telefonunu
    doldurmak icin kategorinin taksonomimize uymasi gerekmiyor.

    DuckDB import'u fonksiyon icinde: paket yalnizca bu yol
    kullanildiginda gerekli olsun, ithal edilemezse uygulama acilista
    patlamasin.
    """
    import duckdb

    south, west, north, east = bbox

    con = duckdb.connect()
    con.execute(
        "INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';"
        " SET enable_progress_bar=false;"
    )

    where = [
        f"bbox.xmin BETWEEN {west} AND {east}",
        f"bbox.ymin BETWEEN {south} AND {north}",
    ]
    if only_mapped:
        keys = ",".join(f"'{k}'" for k in CATEGORY_MAP)
        where.append(
            f"(categories.primary IN ({keys})"
            " OR categories.primary LIKE '%\\_company' ESCAPE '\\'"
            " OR categories.primary LIKE '%\\_museum' ESCAPE '\\'"
            " OR lower(names.primary) LIKE '%holding%')"
        )

    query = f"""
        SELECT id,
               names.primary            AS name,
               categories.primary       AS category,
               bbox.xmin                AS lon,
               bbox.ymin                AS lat,
               confidence,
               phones, websites, emails,
               addresses
        FROM read_parquet('{OVERTURE_S3}', hive_partitioning=1)
        WHERE {" AND ".join(where)}
    """

    rows = con.execute(query).fetchall()
    con.close()

    out: list[dict] = []
    for (
        gid,
        name,
        category,
        lon,
        lat,
        conf,
        phones,
        websites,
        emails,
        addresses,
    ) in rows:
        addr = None
        if addresses:
            first_addr = (
                addresses[0] if isinstance(addresses, (list, tuple)) else addresses
            )
            if isinstance(first_addr, dict):
                addr = first_addr.get("freeform") or None

        out.append(
            {
                "id": f"overture:{gid}",
                "name": name or None,
                "category": category,
                "place_type": classify_overture(category, name),
                "lat": lat,
                "lon": lon,
                # Overture guveni 0-1; bizim confidence kolonu 0-100.
                "confidence": int(round((conf or 0) * 100)),
                "phone": _first(phones),
                "website": _first(websites),
                "email": _first(emails),
                "address": addr,
            }
        )

    logger.info(
        "Overture: bbox %s icin %s kayit (only_mapped=%s)", bbox, len(out), only_mapped
    )
    return out
