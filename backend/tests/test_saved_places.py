"""
Kayitli yerler, listeler ve disa aktarim gecmisi.

Urunun temel vaadi burada sinaniyor: gonullunun kaydettigi sey kaybolmaz
(PRODUCT.md ilke 1). Testler bu vaadin bozulabilecegi yerlere bakiyor -
liste silme, ayni yeri iki kez kaydetme, baskasinin listesine erisme.
"""

import uuid

import pytest
from sqlalchemy import select

from app.auth import validate_api_key
from app.database import APIKey, AsyncSessionLocal, ContactEvent, engine, init_db
from app.main import app

VOLUNTEER_HEADERS = {"X-VOLUNTEER-NAME": "Ece"}


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
        created = client.post(
            "/api/lists", json={"name": "Kadikoy liseleri"}, headers=VOLUNTEER_HEADERS
        )
        assert created.status_code == 201, created.text
        assert created.json()["name"] == "Kadikoy liseleri"
        assert created.json()["place_count"] == 0

        listing = client.get("/api/lists")
        assert listing.status_code == 200
        names = [item["name"] for item in listing.json()]
        assert "Kadikoy liseleri" in names

    def test_place_count_reflects_saved_places(self, client):
        list_id = client.post(
            "/api/lists", json={"name": "Sayim"}, headers=VOLUNTEER_HEADERS
        ).json()["id"]
        client.post(
            "/api/saved",
            json=_place("osm:node:sayim-1", list_id=list_id),
            headers=VOLUNTEER_HEADERS,
        )
        client.post(
            "/api/saved",
            json=_place("osm:node:sayim-2", list_id=list_id),
            headers=VOLUNTEER_HEADERS,
        )

        row = next(
            item for item in client.get("/api/lists").json() if item["id"] == list_id
        )
        assert row["place_count"] == 2

    def test_blank_name_rejected(self, client):
        assert (
            client.post(
                "/api/lists", json={"name": "   "}, headers=VOLUNTEER_HEADERS
            ).status_code
            == 422
        )

    def test_created_by_records_who(self, client):
        """Ekip donusken; devir teslim arayuzun isi (PRODUCT.md ilke 5)."""
        body = client.post(
            "/api/lists", json={"name": "Kim olusturdu"}, headers=VOLUNTEER_HEADERS
        ).json()
        assert body["created_by"] == "Ece"

    @pytest.mark.parametrize("name", [None, "   ", "x" * 121])
    def test_list_creation_requires_a_valid_volunteer_name(self, client, name):
        headers = {} if name is None else {"X-VOLUNTEER-NAME": name}
        assert (
            client.post(
                "/api/lists", json={"name": "Yeni"}, headers=headers
            ).status_code
            == 422
        )


class TestDeletingAListKeepsItsPlaces:
    def test_places_survive_and_become_unfiled(self, client):
        """
        Liste bir klasor, cop kutusu degil.

        Liste silinince icindeki kayitlarin da gitmesi, gonullunun bulmak
        icin emek verdigi veriyi bir ad degistirme islemi sirasinda
        kaybetmesi demekti.
        """
        list_id = client.post(
            "/api/lists", json={"name": "Silinecek"}, headers=VOLUNTEER_HEADERS
        ).json()["id"]
        client.post(
            "/api/saved",
            json=_place("osm:node:kalici-1", list_id=list_id),
            headers=VOLUNTEER_HEADERS,
        )

        removed = client.delete(f"/api/lists/{list_id}")
        assert removed.status_code == 200
        assert removed.json()["released_places"] == 1

        # Kayit duruyor ve artik dosyalanmamis.
        still_there = [
            p
            for p in client.get("/api/saved").json()
            if p["place_id"] == "osm:node:kalici-1"
        ]
        assert len(still_there) == 1
        assert still_there[0]["list_id"] is None

        unfiled_ids = [
            p["place_id"] for p in client.get("/api/saved?list_id=unfiled").json()
        ]
        assert "osm:node:kalici-1" in unfiled_ids


class TestSavingPlaces:
    def test_new_saved_place_has_contact_defaults(self, client):
        saved = client.post(
            "/api/saved",
            json=_place("osm:node:contact-default"),
            headers=VOLUNTEER_HEADERS,
        ).json()
        assert saved["contact_status"] == "uncontacted"
        assert saved["last_contact_at"] is None
        assert saved["next_follow_up_at"] is None

    def test_saving_twice_is_not_an_error(self, client):
        """
        Ayni yeri iki kez kaydetmek bir hata degil, basari durumu.

        Gonullu haritada gezerken ayni okulu tekrar gorup kaydete
        basabilir; "zaten kayitli" diye hata gostermek onu cezalandirir.
        """
        place_id = f"osm:node:tekrar-{uuid.uuid4()}"
        first = client.post(
            "/api/saved", json=_place(place_id), headers=VOLUNTEER_HEADERS
        )
        assert first.status_code == 201
        second = client.post(
            "/api/saved", json=_place(place_id), headers={"X-VOLUNTEER-NAME": "Deniz"}
        )
        assert second.status_code == 201
        assert second.json()["id"] == first.json()["id"]

        matching = [
            p for p in client.get("/api/saved").json() if p["place_id"] == place_id
        ]
        assert len(matching) == 1, "ayni yer iki kayit uretmemeli"
        assert second.json()["saved_by"] == "Ece"

    def test_repeat_save_does_not_require_volunteer_name(self, client):
        place_id = f"osm:node:repeat-without-name-{uuid.uuid4()}"
        first = client.post(
            "/api/saved", json=_place(place_id), headers=VOLUNTEER_HEADERS
        )
        assert first.status_code == 201

        repeated = client.post("/api/saved", json=_place(place_id))
        assert repeated.status_code == 201
        assert repeated.json()["id"] == first.json()["id"]
        assert repeated.json()["saved_by"] == "Ece"

    def test_resaving_with_a_list_moves_the_existing_record(self, client):
        """Kayitli bir yeri listeye eklemek onu oraya tasimali."""
        list_id = client.post(
            "/api/lists", json={"name": "Hedef"}, headers=VOLUNTEER_HEADERS
        ).json()["id"]
        client.post(
            "/api/saved", json=_place("osm:node:tasinan"), headers=VOLUNTEER_HEADERS
        )

        moved = client.post(
            "/api/saved",
            json=_place("osm:node:tasinan", list_id=list_id),
            headers={"X-VOLUNTEER-NAME": "Deniz"},
        )
        assert moved.json()["list_id"] == list_id

    def test_place_data_is_copied_not_referenced(self, client):
        """
        Kayit, arama onbelleginin hala duruyor olmasina bagimli olmamali;
        yerin kendisi kopyalaniyor.
        """
        saved = client.post(
            "/api/saved", json=_place("osm:node:kopya"), headers=VOLUNTEER_HEADERS
        ).json()
        assert saved["name"] == "Kadikoy Anadolu Lisesi"
        assert saved["lat"] == 40.99
        assert saved["tags"]["phone"] == "+90 216 000 00 00"
        assert saved["address"] == "Kadikoy, Istanbul"

    def test_saved_by_records_who(self, client):
        saved = client.post(
            "/api/saved",
            json=_place(f"osm:node:kimkaydetti-{uuid.uuid4()}"),
            headers=VOLUNTEER_HEADERS,
        ).json()
        assert saved["saved_by"] == "Ece"

    def test_unknown_list_is_rejected(self, client):
        response = client.post(
            "/api/saved",
            json=_place("osm:node:hayalet", list_id="yok-boyle-bir-liste"),
            headers=VOLUNTEER_HEADERS,
        )
        assert response.status_code == 404

    @pytest.mark.parametrize("name", [None, "   ", "x" * 121])
    def test_first_save_requires_a_valid_volunteer_name(self, client, name):
        headers = {} if name is None else {"X-VOLUNTEER-NAME": name}
        assert (
            client.post(
                "/api/saved",
                json=_place(f"osm:node:ad-gerekli-{uuid.uuid4()}"),
                headers=headers,
            ).status_code
            == 422
        )


@pytest.mark.asyncio
async def test_saved_places_contact_columns_are_migrated_idempotently():
    await init_db()
    async with engine.connect() as connection:
        columns = await connection.exec_driver_sql("PRAGMA table_info(saved_places)")
        column_names = {row[1] for row in columns.fetchall()}

    assert {"contact_status", "last_contact_at", "next_follow_up_at"} <= column_names

    # Mevcut tabloya migration ikinci kez uygulandiginda da hata olmamali.
    await init_db()


class TestUpdatingSavedPlaces:
    def test_add_note(self, client):
        saved_id = client.post(
            "/api/saved", json=_place("osm:node:notlu"), headers=VOLUNTEER_HEADERS
        ).json()["id"]
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
        list_id = client.post(
            "/api/lists", json={"name": "Cikis"}, headers=VOLUNTEER_HEADERS
        ).json()["id"]
        saved_id = client.post(
            "/api/saved",
            json=_place("osm:node:cikan", list_id=list_id),
            headers=VOLUNTEER_HEADERS,
        ).json()["id"]

        moved = client.patch(f"/api/saved/{saved_id}", json={"list_id": None})
        assert moved.json()["list_id"] is None

    def test_note_only_patch_keeps_the_list(self, client):
        """Not eklemek kaydi listesinden dusurmemeli."""
        list_id = client.post(
            "/api/lists", json={"name": "Korunan"}, headers=VOLUNTEER_HEADERS
        ).json()["id"]
        saved_id = client.post(
            "/api/saved",
            json=_place("osm:node:korunan", list_id=list_id),
            headers=VOLUNTEER_HEADERS,
        ).json()["id"]

        patched = client.patch(f"/api/saved/{saved_id}", json={"note": "ara"})
        assert patched.json()["list_id"] == list_id

    def test_delete(self, client):
        saved_id = client.post(
            "/api/saved", json=_place("osm:node:silinen"), headers=VOLUNTEER_HEADERS
        ).json()["id"]
        assert client.delete(f"/api/saved/{saved_id}").status_code == 200
        remaining = [
            p
            for p in client.get("/api/saved").json()
            if p["place_id"] == "osm:node:silinen"
        ]
        assert remaining == []

    def test_unknown_record_returns_404(self, client):
        assert client.patch("/api/saved/yok", json={"note": "x"}).status_code == 404
        assert client.delete("/api/saved/yok").status_code == 404


class TestContactHistory:
    def _save(self, client, place_id=None):
        place_id = place_id or f"osm:node:contact-{uuid.uuid4()}"
        return client.post(
            "/api/saved", json=_place(place_id), headers=VOLUNTEER_HEADERS
        ).json()

    def test_contact_event_updates_snapshot(self, client):
        saved = self._save(client)
        response = client.post(
            f"/api/saved/{saved['id']}/contacts",
            headers=VOLUNTEER_HEADERS,
            json={
                "status": "follow_up",
                "contacted_at": "2026-08-23",
                "note": "Müdürle konuşuldu",
                "next_follow_up_at": "2026-08-29",
            },
        )
        assert response.status_code == 201
        assert response.json()["contact_status"] == "follow_up"
        assert response.json()["next_follow_up_at"] == "2026-08-29"

    @pytest.mark.parametrize(
        "payload",
        [
            {"status": "unknown", "contacted_at": "2026-08-23"},
            {"status": "contacted", "contacted_at": "not-a-date"},
        ],
    )
    def test_contact_event_rejects_invalid_status_or_date(self, client, payload):
        saved = self._save(client)
        assert (
            client.post(
                f"/api/saved/{saved['id']}/contacts",
                headers=VOLUNTEER_HEADERS,
                json=payload,
            ).status_code
            == 422
        )

    @pytest.mark.parametrize("name", [None, "   ", "x" * 121])
    def test_contact_event_requires_a_valid_volunteer_name(self, client, name):
        saved = self._save(client)
        headers = {} if name is None else {"X-VOLUNTEER-NAME": name}
        response = client.post(
            f"/api/saved/{saved['id']}/contacts",
            headers=headers,
            json={"status": "contacted", "contacted_at": "2026-08-23"},
        )
        assert response.status_code == 422

    def test_contact_history_is_newest_first(self, client):
        saved = self._save(client)
        client.post(
            f"/api/saved/{saved['id']}/contacts",
            headers=VOLUNTEER_HEADERS,
            json={"status": "contacted", "contacted_at": "2026-08-20"},
        )
        client.post(
            f"/api/saved/{saved['id']}/contacts",
            headers=VOLUNTEER_HEADERS,
            json={"status": "follow_up", "contacted_at": "2026-08-23"},
        )
        history = client.get(f"/api/saved/{saved['id']}/contacts")
        assert history.status_code == 200
        assert [event["status"] for event in history.json()] == [
            "follow_up",
            "contacted",
        ]

    def test_other_api_key_cannot_access_place_or_history(self, client, api_key):
        saved = self._save(client, "osm:node:isolated")
        other_key = APIKey(
            id=2,
            name="other",
            key_hash="other",
            daily_limit=100,
            used_today=0,
            plan="pro",
            is_active=True,
            last_reset_date=api_key.last_reset_date,
        )
        app.dependency_overrides[validate_api_key] = lambda: other_key
        try:
            assert client.get(f"/api/saved/{saved['id']}/contacts").status_code == 404
            assert (
                client.post(
                    f"/api/saved/{saved['id']}/contacts",
                    headers=VOLUNTEER_HEADERS,
                    json={"status": "contacted", "contacted_at": "2026-08-23"},
                ).status_code
                == 404
            )
        finally:
            app.dependency_overrides[validate_api_key] = lambda: api_key

    @pytest.mark.asyncio
    async def test_deleting_a_place_removes_its_contact_events(self, client):
        saved = self._save(client, "osm:node:deleted-contact")
        created = client.post(
            f"/api/saved/{saved['id']}/contacts",
            headers=VOLUNTEER_HEADERS,
            json={"status": "contacted", "contacted_at": "2026-08-23"},
        )
        assert created.status_code == 201
        assert client.delete(f"/api/saved/{saved['id']}").status_code == 200
        async with AsyncSessionLocal() as db:
            events = (
                (
                    await db.execute(
                        select(ContactEvent).where(
                            ContactEvent.saved_place_id == saved["id"]
                        )
                    )
                )
                .scalars()
                .all()
            )
        assert events == []

    def test_deleting_a_list_keeps_contact_history(self, client):
        list_id = client.post(
            "/api/lists",
            json={"name": f"Takip-{uuid.uuid4()}"},
            headers=VOLUNTEER_HEADERS,
        ).json()["id"]
        saved = client.post(
            "/api/saved",
            json=_place(f"osm:node:listed-contact-{uuid.uuid4()}", list_id=list_id),
            headers=VOLUNTEER_HEADERS,
        ).json()
        client.post(
            f"/api/saved/{saved['id']}/contacts",
            headers=VOLUNTEER_HEADERS,
            json={"status": "contacted", "contacted_at": "2026-08-23"},
        )
        assert client.delete(f"/api/lists/{list_id}").status_code == 200
        history = client.get(f"/api/saved/{saved['id']}/contacts")
        assert history.status_code == 200
        assert len(history.json()) == 1


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
