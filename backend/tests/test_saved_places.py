"""
Kayitli yerler, listeler ve disa aktarim gecmisi.

Urunun temel vaadi burada sinaniyor: gonullunun kaydettigi sey kaybolmaz
(PRODUCT.md ilke 1). Testler bu vaadin bozulabilecegi yerlere bakiyor -
liste silme, ayni yeri iki kez kaydetme, baskasinin listesine erisme.
"""

import pytest


def _place(place_id: str = "osm:node:1", **overrides) -> dict:
    body = {
        "place_id": place_id,
        "name": "Kadikoy Anadolu Lisesi",
        "place_type": "high_school",
        "lat": 40.99,
        "lon": 29.03,
        "address": "Kadikoy, Istanbul",
        "tags": {"phone": "+90 216 000 00 00"},
    }
    body.update(overrides)
    return body


class TestLists:
    def test_create_and_list(self, client):
        created = client.post("/api/lists", json={"name": "Kadikoy liseleri"})
        assert created.status_code == 201, created.text
        assert created.json()["name"] == "Kadikoy liseleri"
        assert created.json()["place_count"] == 0

        listing = client.get("/api/lists")
        assert listing.status_code == 200
        names = [item["name"] for item in listing.json()]
        assert "Kadikoy liseleri" in names

    def test_place_count_reflects_saved_places(self, client):
        list_id = client.post("/api/lists", json={"name": "Sayim"}).json()["id"]
        client.post("/api/saved", json=_place("osm:node:sayim-1", list_id=list_id))
        client.post("/api/saved", json=_place("osm:node:sayim-2", list_id=list_id))

        row = next(
            item for item in client.get("/api/lists").json() if item["id"] == list_id
        )
        assert row["place_count"] == 2

    def test_blank_name_rejected(self, client):
        assert client.post("/api/lists", json={"name": "   "}).status_code == 422

    def test_created_by_records_who(self, client):
        """Ekip donusken; devir teslim arayuzun isi (PRODUCT.md ilke 5)."""
        body = client.post("/api/lists", json={"name": "Kim olusturdu"}).json()
        assert body["created_by"] == "test"


class TestDeletingAListKeepsItsPlaces:
    def test_places_survive_and_become_unfiled(self, client):
        """
        Liste bir klasor, cop kutusu degil.

        Liste silinince icindeki kayitlarin da gitmesi, gonullunun bulmak
        icin emek verdigi veriyi bir ad degistirme islemi sirasinda
        kaybetmesi demekti.
        """
        list_id = client.post("/api/lists", json={"name": "Silinecek"}).json()["id"]
        client.post("/api/saved", json=_place("osm:node:kalici-1", list_id=list_id))

        removed = client.delete(f"/api/lists/{list_id}")
        assert removed.status_code == 200
        assert removed.json()["released_places"] == 1

        # Kayit duruyor ve artik dosyalanmamis.
        still_there = [
            p for p in client.get("/api/saved").json()
            if p["place_id"] == "osm:node:kalici-1"
        ]
        assert len(still_there) == 1
        assert still_there[0]["list_id"] is None

        unfiled_ids = [
            p["place_id"] for p in client.get("/api/saved?list_id=unfiled").json()
        ]
        assert "osm:node:kalici-1" in unfiled_ids


class TestSavingPlaces:
    def test_saving_twice_is_not_an_error(self, client):
        """
        Ayni yeri iki kez kaydetmek bir hata degil, basari durumu.

        Gonullu haritada gezerken ayni okulu tekrar gorup kaydete
        basabilir; "zaten kayitli" diye hata gostermek onu cezalandirir.
        """
        first = client.post("/api/saved", json=_place("osm:node:tekrar"))
        assert first.status_code == 201
        second = client.post("/api/saved", json=_place("osm:node:tekrar"))
        assert second.status_code == 201
        assert second.json()["id"] == first.json()["id"]

        matching = [
            p for p in client.get("/api/saved").json()
            if p["place_id"] == "osm:node:tekrar"
        ]
        assert len(matching) == 1, "ayni yer iki kayit uretmemeli"

    def test_resaving_with_a_list_moves_the_existing_record(self, client):
        """Kayitli bir yeri listeye eklemek onu oraya tasimali."""
        list_id = client.post("/api/lists", json={"name": "Hedef"}).json()["id"]
        client.post("/api/saved", json=_place("osm:node:tasinan"))

        moved = client.post(
            "/api/saved", json=_place("osm:node:tasinan", list_id=list_id)
        )
        assert moved.json()["list_id"] == list_id

    def test_place_data_is_copied_not_referenced(self, client):
        """
        Kayit, arama onbelleginin hala duruyor olmasina bagimli olmamali;
        yerin kendisi kopyalaniyor.
        """
        saved = client.post("/api/saved", json=_place("osm:node:kopya")).json()
        assert saved["name"] == "Kadikoy Anadolu Lisesi"
        assert saved["lat"] == 40.99
        assert saved["tags"]["phone"] == "+90 216 000 00 00"
        assert saved["address"] == "Kadikoy, Istanbul"

    def test_saved_by_records_who(self, client):
        saved = client.post("/api/saved", json=_place("osm:node:kimkaydetti")).json()
        assert saved["saved_by"] == "test"

    def test_unknown_list_is_rejected(self, client):
        response = client.post(
            "/api/saved", json=_place("osm:node:hayalet", list_id="yok-boyle-bir-liste")
        )
        assert response.status_code == 404


class TestUpdatingSavedPlaces:
    def test_add_note(self, client):
        saved_id = client.post("/api/saved", json=_place("osm:node:notlu")).json()["id"]
        updated = client.patch(
            f"/api/saved/{saved_id}", json={"note": "Mudur yardimcisiyla goruculdu"}
        )
        assert updated.status_code == 200
        assert updated.json()["note"] == "Mudur yardimcisiyla goruculdu"

    def test_move_to_unfiled_with_explicit_null(self, client):
        """
        `list_id: null` "dosyalanmamisa tasi" demek; alanin hic
        gonderilmemesiyle ayni sey degil.
        """
        list_id = client.post("/api/lists", json={"name": "Cikis"}).json()["id"]
        saved_id = client.post(
            "/api/saved", json=_place("osm:node:cikan", list_id=list_id)
        ).json()["id"]

        moved = client.patch(f"/api/saved/{saved_id}", json={"list_id": None})
        assert moved.json()["list_id"] is None

    def test_note_only_patch_keeps_the_list(self, client):
        """Not eklemek kaydi listesinden dusurmemeli."""
        list_id = client.post("/api/lists", json={"name": "Korunan"}).json()["id"]
        saved_id = client.post(
            "/api/saved", json=_place("osm:node:korunan", list_id=list_id)
        ).json()["id"]

        patched = client.patch(f"/api/saved/{saved_id}", json={"note": "ara"})
        assert patched.json()["list_id"] == list_id

    def test_delete(self, client):
        saved_id = client.post("/api/saved", json=_place("osm:node:silinen")).json()["id"]
        assert client.delete(f"/api/saved/{saved_id}").status_code == 200
        remaining = [
            p for p in client.get("/api/saved").json()
            if p["place_id"] == "osm:node:silinen"
        ]
        assert remaining == []

    def test_unknown_record_returns_404(self, client):
        assert client.patch("/api/saved/yok", json={"note": "x"}).status_code == 404
        assert client.delete("/api/saved/yok").status_code == 404


class TestExportHistory:
    def test_endpoint_responds(self, client):
        """
        ExportLog bastan beri yaziliyordu ama hicbir uc onu okumuyordu.
        Uc en azindan calisan bir dizi donmeli.
        """
        response = client.get("/api/exports")
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_limit_is_bounded(self, client):
        assert client.get("/api/exports?limit=0").status_code == 422
        assert client.get("/api/exports?limit=500").status_code == 422
