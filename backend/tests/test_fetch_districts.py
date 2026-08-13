"""
Sinir verisi uretim scriptinin saf fonksiyonlari.

Ag cagrilari (Overpass + Nominatim) test edilmiyor; onlar main()
icinde izole. Buradaki testler ayristirma, kimlik uretimi ve
geometri ekleme mantigini kilitliyor.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from fetch_districts import (  # noqa: E402
    attach_geometry,
    build_feature_collection,
    district_id,
    parse_district_relations,
    tr_slug,
)


class TestTrSlug:
    def test_turkce_karakterler_asciye_cevrilir(self):
        assert tr_slug("Kadıköy") == "kadikoy"
        assert tr_slug("Şişli") == "sisli"
        assert tr_slug("Çerkezköy") == "cerkezkoy"
        assert tr_slug("Süleymanpaşa") == "suleymanpasa"
        assert tr_slug("Büyükçekmece") == "buyukcekmece"
        assert tr_slug("İpsala") == "ipsala"
        assert tr_slug("Pınarhisar") == "pinarhisar"

    def test_bosluk_tireye_cevrilir(self):
        assert tr_slug("Marmara Ereğlisi") == "marmara-ereglisi"

    def test_bilinmeyen_isaretler_atilir(self):
        assert tr_slug("Kadıköy (merkez)") == "kadikoy-merkez"


class TestDistrictId:
    def test_normal_ilce(self):
        assert district_id("34", "istanbul", "Kadıköy") == "tr-34-kadikoy"

    def test_merkez_adinda_il_slugu_kullanilir(self):
        # OSM'de bazi merkez ilceler "Merkez" olarak geciyor. Kimligin
        # okunabilir olmasi icin il adina dusuluyor.
        assert district_id("39", "kirklareli", "Merkez") == "tr-39-kirklareli"
        assert district_id("22", "edirne", "Merkez") == "tr-22-edirne"


class TestParseDistrictRelations:
    def test_relationlari_ayristirir(self):
        data = {
            "elements": [
                {"type": "relation", "id": 1234, "tags": {"name": "Kadıköy"}},
                {"type": "relation", "id": 5678, "tags": {"name": "Şişli"}},
            ]
        }
        result = parse_district_relations(data, "istanbul", "34")
        assert len(result) == 2
        assert result[0] == {
            "id": "tr-34-kadikoy",
            "name": "Kadıköy",
            "province": "istanbul",
            "province_plate": "34",
            "osm_relation_id": 1234,
        }

    def test_isimsiz_relation_atlanir(self):
        data = {"elements": [{"type": "relation", "id": 1, "tags": {}}]}
        assert parse_district_relations(data, "istanbul", "34") == []

    def test_relation_olmayan_eleman_atlanir(self):
        data = {"elements": [{"type": "way", "id": 1, "tags": {"name": "X"}}]}
        assert parse_district_relations(data, "istanbul", "34") == []


class TestAttachGeometry:
    def _kare(self):
        return {
            "type": "Polygon",
            "coordinates": [[[29.0, 41.0], [29.1, 41.0], [29.1, 41.1], [29.0, 41.1], [29.0, 41.0]]],
        }

    def test_geometri_bbox_ve_merkez_eklenir(self):
        metas = [{"id": "tr-34-x", "name": "X", "province": "istanbul",
                  "province_plate": "34", "osm_relation_id": 1234}]
        lookup = [{"osm_type": "relation", "osm_id": 1234, "geojson": self._kare()}]

        result = attach_geometry(metas, lookup, tolerance=0.001)

        assert len(result) == 1
        assert result[0]["geometry"]["type"] == "Polygon"
        # bbox = (south, west, north, east)
        south, west, north, east = result[0]["bbox"]
        assert round(south, 4) == 41.0
        assert round(west, 4) == 29.0
        assert round(north, 4) == 41.1
        assert round(east, 4) == 29.1
        lat, lon = result[0]["center"]
        assert round(lat, 3) == 41.05
        assert round(lon, 3) == 29.05

    def test_geometrisi_olmayan_ilce_hata_verir(self):
        # Sessizce eksik veri uretmek en kotu sonuc: arayuzde o ilce
        # tiklanabilir gorunur ama hicbir zaman sonuc vermez.
        metas = [{"id": "tr-34-x", "name": "X", "province": "istanbul",
                  "province_plate": "34", "osm_relation_id": 1234}]
        try:
            attach_geometry(metas, [], tolerance=0.001)
        except ValueError as exc:
            assert "tr-34-x" in str(exc)
        else:
            raise AssertionError("ValueError beklendi")


class TestBuildFeatureCollection:
    def test_featurecollection_semasi(self):
        districts = [{
            "id": "tr-34-x", "name": "X", "province": "istanbul",
            "province_plate": "34", "osm_relation_id": 1234,
            "geometry": {"type": "Polygon", "coordinates": [[[29.0, 41.0], [29.1, 41.0], [29.0, 41.1], [29.0, 41.0]]]},
            "bbox": (41.0, 29.0, 41.1, 29.1),
            "center": (41.05, 29.05),
        }]

        fc = build_feature_collection(districts)

        assert fc["type"] == "FeatureCollection"
        assert len(fc["features"]) == 1
        props = fc["features"][0]["properties"]
        assert props["id"] == "tr-34-x"
        assert props["bbox"] == [41.0, 29.0, 41.1, 29.1]
        assert props["center"] == [41.05, 29.05]
        assert fc["features"][0]["geometry"]["type"] == "Polygon"
