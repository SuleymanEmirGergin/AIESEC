"""Admin rapor listesi: gercek toplam sayi ve durum filtresi."""

ADMIN_HEADERS = {"X-ADMIN-KEY": "test-admin-key"}


def _create_report(client, place_id: str):
    response = client.post(
        "/api/report",
        json={
            "place_id": place_id,
            "shown_type": "primary_school",
            "correct_type": "high_school",
            "lat": 41.01,
            "lon": 28.98,
            "name": f"Test {place_id}",
        },
    )
    assert response.status_code == 200
    return response


class TestAdminReportListing:
    def test_total_is_real_count_not_page_size(self, client):
        """
        `total` filtrelenmis kumenin tamamini saymali, sayfayi degil.
        Onceden uc duz dizi donduruyordu; istemci toplami tahmin
        etmek zorunda kaliyordu ve sayfa sayisi yanlis cikiyordu.
        """
        for i in range(5):
            _create_report(client, f"node/count-{i}")

        page1 = client.get(
            "/admin/reports?status=open&limit=2&offset=0", headers=ADMIN_HEADERS
        )
        assert page1.status_code == 200
        body = page1.json()

        assert len(body["data"]) == 2, "sayfa boyutu limit kadar olmali"
        assert body["total"] >= 5, "total tum kumeyi saymali"

        # Sonraki sayfa ayni toplami bildirmeli
        page2 = client.get(
            "/admin/reports?status=open&limit=2&offset=2", headers=ADMIN_HEADERS
        )
        assert page2.json()["total"] == body["total"]

    def test_status_all_is_not_silently_open(self, client):
        """
        status=all desteklenmiyordu; istemci parametreyi atlayinca uc
        sessizce "open" filtresine dusuyordu.
        """
        _create_report(client, "node/status-check")

        all_reports = client.get(
            "/admin/reports?status=all&limit=100", headers=ADMIN_HEADERS
        )
        open_reports = client.get(
            "/admin/reports?status=open&limit=100", headers=ADMIN_HEADERS
        )

        assert all_reports.status_code == 200
        assert all_reports.json()["total"] >= open_reports.json()["total"]

    def test_unknown_status_returns_empty_not_all(self, client):
        response = client.get(
            "/admin/reports?status=nonexistent", headers=ADMIN_HEADERS
        )
        assert response.status_code == 200
        assert response.json()["total"] == 0
        assert response.json()["data"] == []

    def test_requires_admin_key(self, client):
        assert client.get("/admin/reports").status_code == 401
