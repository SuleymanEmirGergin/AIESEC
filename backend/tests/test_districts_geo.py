"""
Ilce geometrisi: tampon, nokta testi, uyelik.

Saf geometri fonksiyonlari sentetik poligonlarla test ediliyor;
gercek districts.geojson'a bagimli testler dosya yoksa atlaniyor.
"""

import math

import pytest
from shapely.geometry import MultiPolygon, Polygon

from app.districts import (
    DEFAULT_BUFFER_M,
    buffer_degrees,
    districts_for_point,
    expanded_bbox,
    get_district,
    load_districts,
    point_in_geometry,
    point_membership,
)

# 41.0N civarinda 1 derece boylam ~ 111320 * cos(41) ~ 84 km
REF_LAT = 41.0


def _kare(lat0=41.0, lon0=29.0, boyut=0.1) -> Polygon:
    """Kose noktalari (lon, lat) sirasinda — shapely x=lon, y=lat."""
    return Polygon(
        [
            (lon0, lat0),
            (lon0 + boyut, lat0),
            (lon0 + boyut, lat0 + boyut),
            (lon0, lat0 + boyut),
        ]
    )


class TestPointInGeometry:
    def test_ic_nokta(self):
        assert point_in_geometry(_kare(), 41.05, 29.05) is True

    def test_dis_nokta(self):
        assert point_in_geometry(_kare(), 41.5, 29.05) is False

    def test_multipolygon_ikinci_parca(self):
        # Adalar gibi cok parcali ilceler: nokta ikinci parcada olabilir.
        geom = MultiPolygon([_kare(41.0, 29.0), _kare(41.5, 29.5)])
        assert point_in_geometry(geom, 41.55, 29.55) is True

    def test_poligon_deligi_dis_sayilir(self):
        dis = [(29.0, 41.0), (29.4, 41.0), (29.4, 41.4), (29.0, 41.4)]
        delik = [(29.1, 41.1), (29.3, 41.1), (29.3, 41.3), (29.1, 41.3)]
        geom = Polygon(dis, [delik])
        assert point_in_geometry(geom, 41.2, 29.2) is False  # delik icinde
        assert point_in_geometry(geom, 41.05, 29.05) is True  # delik disinda


class TestBufferDegrees:
    def test_tampon_kuzeye_dogru_metrik(self):
        # Sinirin 1 km kuzeyi tampon icinde, 3 km kuzeyi disinda.
        geom = _kare()
        tamponlu = buffer_degrees(geom, 2000, REF_LAT)
        bir_km = 1000 / 111320.0
        uc_km = 3000 / 111320.0
        assert point_in_geometry(tamponlu, 41.1 + bir_km, 29.05) is True
        assert point_in_geometry(tamponlu, 41.1 + uc_km, 29.05) is False

    def test_tampon_doguya_dogru_da_metrik(self):
        """
        Anizotropi kilidi.

        Izotropik buffer(2000/111320) uygulanirsa dogu yonundeki tampon
        derece cinsinden kuzeyle ayni kalir (0.017966 derece), ama 41N'de
        1 derece boylam ~84 km (1 derece enlemden dusuk) oldugu icin bu
        derece-tamponu gercekte yalnizca ~1510 m'ye karsilik gelir —
        istenen 2000 m'nin ~%75'i. Yani sinirin 2000 m dogusuna yakin,
        gercekte tamponun icinde olmasi gereken bir nokta yanlislikla
        DISARIDA sayilir.

        Kontrol noktalari 2 km hedefin hemen icinde/disinda (1.9/2.1 km)
        seciliyor: 1/3 km gibi gevsek bir aralik hem duzeltilmemis
        (~1510 m) hem de ters olceklenmis (yanlislikla ~1140 m) tamponu
        da "dogru" gibi gecirir, cunku ikisi de 1-3 km arasinda kalir.
        Bu test dogru olcekleme yapilmadikca gecmez.
        """
        geom = _kare()
        tamponlu = buffer_degrees(geom, 2000, REF_LAT)
        metre_per_derece_lon = 111320.0 * math.cos(math.radians(REF_LAT))

        hedefin_icinde = 1900 / metre_per_derece_lon
        hedefin_disinda = 2100 / metre_per_derece_lon

        assert point_in_geometry(tamponlu, 41.05, 29.1 + hedefin_icinde) is True
        assert point_in_geometry(tamponlu, 41.05, 29.1 + hedefin_disinda) is False

    def test_tampon_orijinali_kapsar(self):
        geom = _kare()
        assert buffer_degrees(geom, 2000, REF_LAT).contains(geom)

    def test_sifir_tampon_geometriyi_degistirmez(self):
        geom = _kare()
        assert buffer_degrees(geom, 0, REF_LAT).equals(geom)


class TestDefaultBuffer:
    def test_varsayilan_2000(self):
        assert DEFAULT_BUFFER_M == 2000


# --- districts.geojson'a bagimli testler ---


def _veri_var() -> bool:
    try:
        return len(load_districts()) > 0
    except FileNotFoundError:
        return False


gerekli_veri = pytest.mark.skipif(
    not _veri_var(),
    reason="app/data/districts.geojson yok; once scripts/fetch_districts.py calistir",
)


@gerekli_veri
class TestLoadDistricts:
    def test_seksen_ilce(self):
        assert len(load_districts()) == 80

    def test_bes_il(self):
        plakalar = {d.province_plate for d in load_districts().values()}
        assert plakalar == {"34", "22", "59", "39", "44"}

    def test_kadikoy_var(self):
        ilce = get_district("tr-34-kadikoy")
        assert ilce is not None
        assert ilce.province_plate == "34"

    def test_bilinmeyen_ilce_none(self):
        assert get_district("tr-99-yok") is None

    def test_expanded_bbox_orijinalden_genis(self):
        ilce = get_district("tr-34-kadikoy")
        s, w, n, e = expanded_bbox("tr-34-kadikoy", 2000)
        assert s < ilce.bbox[0]
        assert w < ilce.bbox[1]
        assert n > ilce.bbox[2]
        assert e > ilce.bbox[3]


@gerekli_veri
class TestPointMembership:
    def test_ilce_merkezi_kesin_ici(self):
        ilce = get_district("tr-34-kadikoy")
        lat, lon = ilce.center
        assert point_membership("tr-34-kadikoy", lat, lon, 2000) is True

    def test_uzak_nokta_uye_degil(self):
        # Malatya merkezi Kadikoy'un uyesi olamaz.
        malatya = get_district("tr-44-battalgazi")
        lat, lon = malatya.center
        assert point_membership("tr-34-kadikoy", lat, lon, 2000) is None

    def test_bbox_on_filtresi_uzak_noktayi_hemen_eler(self):
        # Kuzey Kutbu: bbox testinden gecemez, poligon testine hic
        # ulasilmaz.
        assert point_membership("tr-34-kadikoy", 89.0, 0.0, 2000) is None

    def test_bir_nokta_iki_ilceye_uye_olabilir(self):
        """
        Tamponun sebebi: sinirdaki kayit iki ilceye de ait.
        Kadikoy merkezi en az Kadikoy'un uyesi; komsu ilcelerin
        tamponuna girip girmedigi geometriye bagli, o yuzden
        yalnizca "en az bir" ve "hepsi gecerli deger" kontrol ediliyor.
        """
        ilce = get_district("tr-34-kadikoy")
        uyelikler = districts_for_point(ilce.center[0], ilce.center[1], 2000)

        assert len(uyelikler) >= 1
        assert ("tr-34-kadikoy", True) in uyelikler
        # Kesin ici olabilecegi tek ilce var; digerleri tampon olmali.
        assert sum(1 for _, is_inside in uyelikler if is_inside) == 1
