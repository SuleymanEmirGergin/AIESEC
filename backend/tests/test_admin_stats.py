"""
Yonetim ozeti. Canlida (Postgres) 500 veriyordu: GROUP BY place_id ile
name okunuyordu (SQLite izin veriyor, Postgres vermiyor). Ayrica ekranin
bekledigi last_7_days / last_30_days hic gonderilmiyordu.
"""

from datetime import datetime, timedelta, timezone

from app.database import AsyncSessionLocal, Report, init_db

ADMIN = {"X-ADMIN-KEY": "test-admin-key"}


async def _reports():
    await init_db()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    async with AsyncSessionLocal() as db:
        for place, name, days in [
            ("osm:node:stat-a", "Alfa Lisesi", 1),
            ("osm:node:stat-a", "Alfa Lisesi", 3),
            ("osm:node:stat-a", "Alfa Lisesi", 20),
            ("osm:node:stat-b", "Beta Otel", 2),
            ("osm:node:stat-c", "Eski Kayit", 45),
        ]:
            db.add(Report(place_id=place, name=name, shown_type="college_university",
                          correct_type="high_school", lat=41.0, lon=29.0,
                          created_at=now - timedelta(days=days)))
        await db.commit()


async def test_ozet_ekranin_bekledigi_alanlari_doner(client):
    await _reports()
    response = client.get("/admin/stats", headers=ADMIN)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["last_7_days"] >= 3
    assert body["last_30_days"] >= body["last_7_days"] + 1
    top = body["top_reported_places"]
    alfa = next(p for p in top if p["place_id"] == "osm:node:stat-a")
    assert alfa == {"place_id": "osm:node:stat-a", "name": "Alfa Lisesi", "count": 3}
    assert all(p["place_id"] != "osm:node:stat-c" for p in top), "30 gunden eski sayilmamali"
    assert top[0]["count"] >= top[-1]["count"]


def test_yonetici_anahtari_olmadan_kapali(client):
    assert client.get("/admin/stats").status_code in (401, 403)
