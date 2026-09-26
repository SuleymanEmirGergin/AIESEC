"""
Ekip is akisi: sorumlu atama, takip tarihi, toplu guncelleme, ilce bilgisi,
aramada kayitlilari gizleme ve pano ozeti.

Sorumlu herkes tarafindan herkese atanabilir; kimin atadigi kayitta durur.
"""

import uuid
from datetime import date, timedelta

from app.database import AsyncSessionLocal, init_db
from app.store import add_memberships, place_row_values, upsert_places

HEADERS = {"X-VOLUNTEER-NAME": "Ece"}
AYSE = {"email": "ayse@ornek.org", "name": "Ayşe Yılmaz"}


def _place(place_id: str, **overrides) -> dict:
    body = {"place_id": place_id, "name": "Test Lisesi", "place_type": "high_school",
            "lat": 40.99, "lon": 29.03, "address": None, "tags": {}}
    body.update(overrides)
    return body


def _save(client, name="Test Lisesi") -> dict:
    response = client.post("/api/saved", json=_place(f"osm:node:tw-{uuid.uuid4()}", name=name), headers=HEADERS)
    assert response.status_code == 201, response.text
    return response.json()


class TestSorumlu:
    def test_atama_kim_atadi_ile_kaydedilir(self, client):
        saved = _save(client)
        response = client.patch(f"/api/saved/{saved['id']}", json={"assignee": AYSE}, headers={"X-VOLUNTEER-NAME": "Emir"})
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["assigned_to"] == "ayse@ornek.org"
        assert body["assigned_name"] == "Ayşe Yılmaz"
        assert body["assigned_by"] == "Emir"
        assert body["assigned_at"] is not None

    def test_atama_kaldirilabilir(self, client):
        saved = _save(client)
        client.patch(f"/api/saved/{saved['id']}", json={"assignee": AYSE}, headers=HEADERS)
        body = client.patch(f"/api/saved/{saved['id']}", json={"assignee": None}, headers=HEADERS).json()
        assert body["assigned_to"] is None and body["assigned_name"] is None

    def test_baska_alana_dokunmak_atamayi_silmez(self, client):
        saved = _save(client)
        client.patch(f"/api/saved/{saved['id']}", json={"assignee": AYSE}, headers=HEADERS)
        body = client.patch(f"/api/saved/{saved['id']}", json={"note": "not"}, headers=HEADERS).json()
        assert body["assigned_to"] == "ayse@ornek.org"

    def test_gecersiz_eposta_reddedilir(self, client):
        saved = _save(client)
        response = client.patch(f"/api/saved/{saved['id']}", json={"assignee": {"email": "yok", "name": "X"}}, headers=HEADERS)
        assert response.status_code == 422

    def test_takip_tarihi_ertelenebilir(self, client):
        saved = _save(client)
        target = (date.today() + timedelta(days=7)).isoformat()
        body = client.patch(f"/api/saved/{saved['id']}", json={"next_follow_up_at": target}, headers=HEADERS).json()
        assert body["next_follow_up_at"] == target
        body = client.patch(f"/api/saved/{saved['id']}", json={"next_follow_up_at": None}, headers=HEADERS).json()
        assert body["next_follow_up_at"] is None


class TestTopluGuncelleme:
    def test_durum_hepsine_uygulanir_ve_gecmise_yazilir(self, client):
        a, b = _save(client, "A Lisesi"), _save(client, "B Lisesi")
        response = client.post("/api/saved/bulk-update", json={"ids": [a["id"], b["id"]], "contact_status": "contacted"}, headers=HEADERS)
        assert response.status_code == 200, response.text
        assert response.json()["updated"] == 2
        for saved in (a, b):
            events = client.get(f"/api/saved/{saved['id']}/contacts").json()
            assert events[0]["status"] == "contacted"
            assert events[0]["volunteer_name"] == "Ece"
            assert "Toplu" in (events[0]["note"] or "")
        places = {p["id"]: p for p in client.get("/api/saved").json()}
        assert places[a["id"]]["contact_status"] == "contacted"
        assert places[a["id"]]["last_contact_at"] == date.today().isoformat()

    def test_sorumlu_ve_takip_toplu_atanir(self, client):
        a, b = _save(client), _save(client)
        target = (date.today() + timedelta(days=3)).isoformat()
        response = client.post("/api/saved/bulk-update", json={"ids": [a["id"], b["id"]], "assignee": AYSE, "next_follow_up_at": target}, headers=HEADERS)
        assert response.json()["updated"] == 2
        places = {p["id"]: p for p in client.get("/api/saved").json()}
        assert places[b["id"]]["assigned_name"] == "Ayşe Yılmaz"
        assert places[b["id"]]["next_follow_up_at"] == target
        # Durum gonderilmedi: gecmise olay eklenmemeli.
        assert client.get(f"/api/saved/{a['id']}/contacts").json() == []

    def test_bos_istek_reddedilir(self, client):
        a = _save(client)
        assert client.post("/api/saved/bulk-update", json={"ids": [a["id"]]}, headers=HEADERS).status_code == 422


D = "tr-34-bakirkoy"


async def _district_place(osm_id: int, name: str) -> str:
    await init_db()
    async with AsyncSessionLocal() as db:
        row = place_row_values({"type": "node", "id": osm_id, "lat": 40.98, "lon": 28.87,
                                "tags": {"name": name, "tourism": "hotel"}}, "hotel", 60, None)
        await upsert_places(db, [row])
        await add_memberships(db, D, [(row["id"], True)])
        await db.commit()
        return row["id"]


class TestIlceVeGizleme:
    async def test_liste_ilce_adini_icerir(self, client):
        pid = await _district_place(990_101, "Ilce Testi Oteli")
        client.post("/api/saved", json=_place(pid, name="Ilce Testi Oteli"), headers=HEADERS)
        saved = next(p for p in client.get("/api/saved").json() if p["place_id"] == pid)
        assert saved["district_id"] == D
        assert saved["district_name"] == "Bakırköy"

    async def test_kayitlilar_gizlenebilir(self, client):
        kayitli = await _district_place(990_102, "Gizli Kayitli Otel")
        yeni = await _district_place(990_103, "Gorunen Yeni Otel")
        client.post("/api/saved", json=_place(kayitli, name="Gizli Kayitli Otel"), headers=HEADERS)
        base = f"/api/districts/{D}/places?types=hotel&limit=1000&q=otel"
        hepsi = {r["id"] for r in client.get(base).json()["results"]}
        yalniz_yeni = client.get(base + "&exclude_saved=true").json()
        ids = {r["id"] for r in yalniz_yeni["results"]}
        assert kayitli in hepsi and kayitli not in ids
        assert yeni in ids
        assert yalniz_yeni["total"] == len(ids)


class TestPano:
    def test_ozet_sayilari(self, client):
        a, b, c = _save(client, "P1"), _save(client, "P2"), _save(client, "P3")
        today = date.today().isoformat()
        client.post(f"/api/saved/{a['id']}/contacts", json={"status": "positive", "contacted_at": today}, headers=HEADERS)
        client.post(f"/api/saved/{b['id']}/contacts", json={"status": "follow_up", "contacted_at": today,
                    "next_follow_up_at": (date.today() - timedelta(days=1)).isoformat()}, headers={"X-VOLUNTEER-NAME": "Deniz"})
        client.patch(f"/api/saved/{c['id']}", json={"assignee": AYSE}, headers=HEADERS)

        response = client.get("/api/dashboard")
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["totals"]["saved"] >= 3
        assert body["totals"]["positive"] >= 1
        assert body["totals"]["overdue"] >= 1
        assert body["by_status"]["positive"] >= 1
        people = {p["name"]: p for p in body["by_person"]}
        assert people["Ece"]["contacts"] >= 1 and people["Ece"]["positive"] >= 1
        assert people["Deniz"]["contacts"] >= 1
        assert people["Ayşe Yılmaz"]["assigned"] >= 1
        assert len(body["weekly"]) == 8
        assert body["weekly"][-1]["count"] >= 2
