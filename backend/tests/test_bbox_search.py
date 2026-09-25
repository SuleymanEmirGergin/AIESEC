"""
Acik bbox parametresi.

Cagiran gercek bir dikdortgen biliyorsa (haritanin goruntu alani) onu
daireye cevirip tekrar dikdortgene donmek gereksiz genis bir alan
taratiyor: dikdortgeni kapsayan cember 16:9 bir viewport'ta yaklasik
%60 fazla alan demek.
"""

from unittest.mock import patch

import pytest

from app.geo import bbox_circumscribed_radius_m, bbox_from_radius, snap_bbox_outward
from tests.conftest import overpass_stub

SEAM = "app.search_service.overpass_client.query"

# Istanbul merkezinde kucuk bir dikdortgen (minLon,minLat,maxLon,maxLat)
BBOX_PARAM = "28.96,41.00,29.00,41.03"


def _capture_queries():
    """Overpass'e giden sorgu metinlerini toplayan stub."""
    seen = []
    inner = overpass_stub([])

    async def _query(query_text, debug=False):
        seen.append(query_text)
        return await inner(query_text, debug)

    return seen, _query


class TestBboxParsing:
    def test_bbox_is_used_verbatim_in_query(self, client):
        seen, stub = _capture_queries()
        with patch(SEAM, new=stub):
            response = client.get(
                f"/api/search?lat=41.015&lon=28.98&type=kindergarten&bbox={BBOX_PARAM}"
            )

        assert response.status_code == 200
        assert seen, "Overpass sorgusu hic olusturulmadi"
        # Overpass bbox sirasi: (south,west,north,east). Sorgu olusturucu
        # koordinatlari 6 ondalikla yaziyor.
        assert "(41.000000,28.960000,41.030000,29.000000)" in seen[0]

    def test_bbox_overrides_radius(self, client):
        """radius verilse bile bbox kazanmali."""
        seen, stub = _capture_queries()
        with patch(SEAM, new=stub):
            response = client.get(
                "/api/search?lat=41.015&lon=28.98&type=kindergarten"
                f"&radius=5000&bbox={BBOX_PARAM}"
            )

        assert response.status_code == 200
        assert "around:" not in seen[0], "bbox verilirken around modu kullanilmamali"

    @pytest.mark.parametrize(
        "bad",
        [
            "28.96,41.00,29.00",  # 4 sayi degil
            "a,b,c,d",  # sayi degil
            "29.00,41.00,28.96,41.03",  # ters (minLon > maxLon)
            "28.96,41.03,29.00,41.00",  # ters (minLat > maxLat)
            "28.96,91.00,29.00,92.00",  # enlem araligi disi
            "-181,41.00,29.00,41.03",  # boylam araligi disi
        ],
    )
    def test_invalid_bbox_rejected(self, client, bad):
        response = client.get(
            f"/api/search?lat=41.015&lon=28.98&type=kindergarten&bbox={bad}"
        )
        assert response.status_code == 422

    def test_limit_uses_raw_bbox_not_snapped(self, client, api_key):
        """
        Alan kontrolu kullanicinin istedigi alana bakmali, bizim
        onbellek optimizasyonumuza degil.

        Izgaraya oturtma alani disari dogru buyutuyor (kenar basina 0.01
        dereceye kadar). Kontrol snap'ten sonra yapilirsa, sinirin altinda
        kalan bir istek bizim optimizasyonumuz yuzunden 403 aliyor.

        Asagidaki bbox'in ham esdeger yaricapi 4752 m (sinir 5000),
        snap'lenmis hali ise 5122 m - yani snap uzerinden kontrol
        edilseydi reddedilirdi.
        """
        seen, stub = _capture_queries()
        with patch(SEAM, new=stub):
            response = client.get(
                "/api/search?lat=41.01&lon=28.975&type=kindergarten"
                "&bbox=28.923767,40.991776,29.026234,41.028224"
            )

        assert response.status_code == 200, (
            "sinira oturan bbox reddedildi; alan kontrolu snap'ten once yapilmali"
        )

    def test_bbox_respects_area_limit(self, client, api_key):
        """
        Bbox alan sinirini atlatmanin yolu olmamali: cok genis bir
        dikdortgen, esdeger yaricap uzerinden reddedilmeli.
        """
        response = client.get(
            "/api/search?lat=41.0&lon=29.0&type=kindergarten&bbox=28.0,40.5,30.0,41.5"
        )
        assert response.status_code == 403
        assert "genis" in response.json()["detail"].lower()


class TestBboxGeometry:
    def test_snapping_only_grows_the_box(self):
        """Izgaraya oturtma hep disari olmali; iceri yuvarlamak kapsam kaybi demek."""
        original = (41.004, 28.964, 41.026, 28.996)  # south, west, north, east
        snapped = snap_bbox_outward(original)

        assert snapped[0] <= original[0], "guney kenari asagi inmeli"
        assert snapped[1] <= original[1], "bati kenari sola gitmeli"
        assert snapped[2] >= original[2], "kuzey kenari yukari cikmali"
        assert snapped[3] >= original[3], "dogu kenari saga gitmeli"

    def test_explicit_bbox_is_smaller_than_circumscribed_circle(self):
        """
        Ozelligin varlik sebebi: viewport'u daireye cevirmek alani buyutuyor.
        Ayni dikdortgen icin cemberin kapsadigi alan belirgin sekilde daha genis.
        """
        viewport = (41.00, 28.96, 41.03, 29.00)
        radius = bbox_circumscribed_radius_m(viewport)
        circle_box = bbox_from_radius(
            *[(viewport[0] + viewport[2]) / 2, (viewport[1] + viewport[3]) / 2], radius
        )

        def area(b):
            return (b[2] - b[0]) * (b[3] - b[1])

        assert area(circle_box) > area(viewport) * 1.3
