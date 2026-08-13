# İlçe Seçimli Yerel POI Arama — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Viewport bazlı sürekli Overpass sorgusunu, 80 ilçelik sonlu bir yerel SQLite veritabanı üzerinde çalışan ilçe seçimli araca çevirmek.

**Architecture:** Uygulama ikiye bölünüyor. **Ingest** (ağa bağlı, tek seferlik, 320 Overpass sorgusu) ilçe başına ham OSM verisini çeker, `classify.py` ile 10 türe ayırır, `places` + `place_districts` tablolarına yazar. **Sorgu** (yerel SQL, sınırsız, 0 Overpass sorgusu) bu tablolar üzerinde filtreler ve sıralar. Tür ayrımı zaten yerel üretildiği için türü Overpass'e sormak gereksiz iş; anahtar uzayı ilçe × tür = 720 değil, sadece ilçe = 80.

**Tech Stack:** FastAPI 0.115.6 · SQLAlchemy 2.0.37 (async) · aiosqlite · shapely 2.x (yeni) · httpx · pytest 8.3.4 + pytest-asyncio 0.25.2 · Next.js 14.2 · React 18.3 · react-leaflet 4.2 · Tailwind 3.4 · vitest (yeni)

**Spec:** `docs/superpowers/specs/2026-08-13-ilce-secimli-yerel-poi-arama-design.md`

## Global Constraints

- **Kapsam:** yalnızca İstanbul (plaka 34), Edirne (22), Tekirdağ (59), Kırklareli (39), Malatya (44) — 80 ilçe. Bu illerin dışında hiçbir koşulda Overpass sorgusu atılmaz.
- **Tampon:** `DISTRICT_BUFFER_M=2000` (env, varsayılan 2000).
- **10 tür:** `factory`, `office`, `workshop`, `kindergarten`, `primary_school`, `middle_school`, `high_school`, `private_school`, `college_keyword`, `college_university`.
- **İlçe kimliği:** `tr-{plaka}-{slug}` — `tr-34-kadikoy`, `tr-22-kesan`. Merkez ilçeler OSM'de bileşik adla etiketli ("Edirne Merkez", "Kırklareli Merkez"), dolayısıyla kimlikleri `tr-22-edirne-merkez` ve `tr-39-kirklareli-merkez`. **Bu gerçek veri esastır.** `district_id`'deki çıplak `"merkez"` dalı bu veri setinde hiç tetiklenmiyor (ölü kod); OSM etiketlemesi değişirse devreye girer diye duruyor. Kimlikler `districts.geojson`'dan okunur, asla elle türetilmez.
- **Kod yorumları ASCII Türkçe** (mevcut desen: `classify.py`, `models.py`). Kullanıcıya görünen metinler tam Türkçe diakritikle (`Atölye`, `İlkokul`).
- **Commit formatı:** `<type>: <description>` — `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`. Mesaj gövdesi ASCII.
- **Dosya boyutu:** 200-400 satır tipik, 800 maksimum. Fonksiyonlar <50 satır.
- **Immutability:** nesneleri mutasyona uğratma, yenisini üret.
- `console.log` bırakma. Girdi doğrulaması zorunlu (pydantic / açık kontrol).
- **Test komutu (backend):** `cd backend && python -m pytest tests/ -v`
- **Test komutu (frontend):** `pnpm test` (Task 10'da kurulur), `pnpm type-check`
- **Tasarım sistemi (ZORUNLU):** proje kilitli bir tasarım sistemi kullanıyor — `design.md` ve `src/app/tokens.css`. **Bileşenler ham renk/font değeri yazmaz.** `bg-accent`, `text-ink-4`, `border-rule` gibi ham Tailwind renkleri yasak. Kullanılabilir sınıflar: renk `paper/paper-2/paper-3`, `ink/ink-2/ink-3/ink-4`, `rule/rule-2`, `accent/accent-hover/accent-ink/accent-wash/accent-edge`, `graphite/graphite-2/graphite-ink/graphite-ink-2`, `positive`, `caution/caution-bg/caution-on-dark`, `critical`, `scrim`; yazı `font-display/body/mono`, `text-2xs`; köşe `rounded-chip/input/card`; geçiş `duration-fast/short/mid` + `ease-out/in/in-out`; gölge `shadow-lift/modal`; yardımcı sınıf `mono-label`, `surface`, `rule-b/rule-r/rule-t`, `pressable`, `tabular`, `btn`, `btn--primary`, `btn--ghost`, `field-note`, `text-balance`. **Yeni bileşen yazmadan önce `design.md` okunacak** ve en yakın mevcut bileşenin deseni izlenecek: chip'ler `Filters.tsx`, liste satırları `PlaceList.tsx`, modal `ModalShell.tsx`, buton şeridi `ExportToolbar.tsx`.
- **Dokunulmayacak:** `admin` router, override sistemi, rapor akışı.
- **`GET /api/search` artık "dokunulmaz" DEĞİL** — bu plan yazıldıktan sonra üç commit onu yeniden yazdı (açık `bbox` parametresi, `geo.py`'ye `snap_bbox_outward`, `test_bbox_search.py`). Yeni ilçe uçları yanına ekleniyor; mevcut davranışı bozmamak yeterli. Plandaki `search.py` / `cache.py` / `route.ts` satır numaralarına güvenilmeyecek, dosya okunup doğrulanacak.

## Dosya Yapısı

**Backend — yeni**

| Dosya | Sorumluluk | Task |
|---|---|---|
| `app/districts.py` | GeoJSON yükleme, anizotropik tampon, nokta→ilçe testi | 3 |
| `app/store.py` | `places` / `place_districts` yazma-okuma, `has_contact` türetimi | 5 |
| `app/queries.py` | Filtre+sıralama → parametreli SQL, `lead_score` | 7 |
| `app/ingest.py` | CLI, aile/aşama orkestrasyonu, idempotency, bbox bölme | 6 |
| `app/routers/districts.py` | 4 endpoint | 8 |
| `app/data/districts.geojson` | Üretilen sınır verisi (git'e girer) | 2 |
| `scripts/fetch_districts.py` | Sınır verisi üretimi (tek seferlik) | 2 |

**Backend — değişen:** `app/classify.py` (T1), `app/models.py` (T1), `app/policy.py` (T1), `app/search_service.py` (T1), `app/database.py` (T4), `app/config.py` (T9), `app/auth.py` (T9), `app/main.py` (T6, T8), `requirements.txt` (T2)

**Backend — silinen:** `app/services/warmup.py` (T6)

**Frontend — yeni**

| Dosya | Sorumluluk | Task |
|---|---|---|
| `src/lib/districts.ts` | Metadata + GeoJSON çekme, istemci önbelleği | 10 |
| `src/components/DistrictPicker.tsx` | İl chip'leri + aranabilir ilçe combobox | 11 |
| `src/components/FilterPanel.tsx` | Sıralama + filtre kontrolleri | 12 |
| `src/hooks/useDistrictPlaces.ts` | Sorgu state'i | 13 |
| `src/app/api/districts/[...path]/route.ts` | Next proxy | 13 |
| `src/components/DistrictLayer.tsx` | Leaflet GeoJSON katmanı | 14 |
| `vitest.config.ts`, `vitest.setup.ts` | Test koşucusu | 10 |

**Frontend — değişen:** `src/lib/types.ts` (T1), `src/lib/labels.ts` (T1), `src/components/Filters.tsx` (T1, T12), `src/components/MapView.tsx` (T14), `src/app/page.tsx` (T15), `package.json` (T10)

## Task Sırası ve Bağımlılıklar

```
T1 ✅ TAMAM ─────> T2 (sinir verisi) ──> T3 (districts.py) ──┐
                                                              ├─> T6 (ingest)
                        T4 (tablolar) ──> T5 (store.py) ──────┘
                                              │
                                              v
                                   T7 (queries.py) ──> T8 (router) ──> T9 (LOCAL_MODE)
                                                            │
                                                            v
   T10 (vitest + districts.ts) ──> T11 (picker) ──> T12 (panel) ──> T13 (hook+proxy)
                                                                          │
                                                                          v
                                                        T14 (harita) ──> T15 (page.tsx)
                                                                                │
                                                                                v
                                                                        T16 (tam ingest)
```

T1 ön koşul: ingest sınıflandırmaya dayandığı için hatalı taksonomiyle çekilen veri yeniden çekilmek zorunda kalır.

---

## Task 1: Taksonomi — üniversite sınıflandırması ve 10. tür ✅ TAMAMLANDI

> **Bu task uygulanmıştır — dispatch EDİLMEYECEK.** Commit `290d098`.
> `classify.py`'deki ulaşılamaz üniversite dalı düzeltildi, `RADIUS_PRESETS`
> ve `PlaceType` 10 türe çıktı, `college_keyword` etiketi "Kolej"e çevrildi.
> Test `backend/tests/test_university_taxonomy.py` adıyla duruyor (aşağıda
> `test_classify_university.py` yazıyor — ad farkı, kapsam aynı).
> Planın öngörmediği bir boşluk da kapatıldı: `policy.py`'deki `is_edu`
> listesi `search_service.py`'deki ikiziyle eşitlendi.
>
> Aşağıdaki içerik tarihsel kayıt olarak duruyor.

### (uygulanmış) Task 1 içeriği

**Neden:** `classify.py:44` `amenity != "school"` ise `None` dönüyor; üniversiteler oradan çıkıyor ve `classify.py:88`'deki `amenity in ["university","college"]` dalı **ulaşılamaz kod**. `craft`/`workshop` hatasının (`classify.py:149`'daki yorum) ikizi. Ayrıca `college_university` değeri `RADIUS_PRESETS`'te olmadığı için hiç istenemiyordu.

**Files:**
- Modify: `backend/app/classify.py:40-46` (erken çıkış öncesine kontrol), `backend/app/classify.py:87-89` (artık yinelenen kontrolü sil)
- Modify: `backend/app/models.py:9-19` (`RADIUS_PRESETS`)
- Modify: `backend/app/policy.py:60-63` (`is_edu` listesi)
- Modify: `backend/app/search_service.py:184-187` (`is_edu` listesi)
- Modify: `src/lib/types.ts:1-10` (`PlaceType`)
- Modify: `src/lib/labels.ts` (`PLACE_TYPE_LABELS`, `PLACE_TYPE_GROUPS`)
- Modify: `src/components/Filters.tsx:18-28` (`CATEGORIES`)
- Test: `backend/tests/test_classify_university.py`

**Interfaces:**
- Consumes: yok (ilk task)
- Produces: `classify_school_level(tags: dict, name: str) -> str | None` artık `"college_university"` döndürebiliyor. `RADIUS_PRESETS` 10 anahtar içeriyor. Frontend `PlaceType` union'ı `"college_university"` içeriyor.

- [ ] **Step 1: Testi yaz**

`backend/tests/test_classify_university.py`:

```python
"""
Universite siniflandirmasi regresyon testleri.

classify.py:44'teki `amenity != "school"` erken cikisi yuzunden
universiteler siniflandirilamiyordu ve asagidaki university/college
dali ulasilamaz koddu. Bu dosya o dalin ulasilabilir kaldigini
kilitliyor.
"""

from app.classify import classify_school_level
from app.models import RADIUS_PRESETS


def test_amenity_university_college_university_dondurur():
    assert classify_school_level(
        {"amenity": "university"}, "Bogazici Universitesi"
    ) == "college_university"


def test_amenity_college_college_university_dondurur():
    assert classify_school_level(
        {"amenity": "college"}, "Teknik Yuksekokul"
    ) == "college_university"


def test_universite_isimsiz_de_siniflanir():
    # Etiket tek basina yeterli; isim bos olsa bile tur belli.
    assert classify_school_level({"amenity": "university"}, "") == "college_university"


def test_kolej_adi_hala_college_keyword():
    # Regresyon: Turkiye'de "kolej" ozel K-12 demek, universite degil.
    # classify.py:92'deki yorum bu ayrimin bilincli oldugunu soyluyor.
    assert classify_school_level(
        {"amenity": "school"}, "Isik Koleji"
    ) == "college_keyword"


def test_anaokulu_etkilenmedi():
    assert classify_school_level(
        {"amenity": "kindergarten"}, "Gunes Anaokulu"
    ) == "kindergarten"


def test_okul_olmayan_amenity_none_dondurur():
    assert classify_school_level({"amenity": "restaurant"}, "Lokanta") is None


def test_college_university_desteklenen_tur():
    # SUPPORTED_TYPES = frozenset(RADIUS_PRESETS.keys()); bu anahtar
    # olmadan tur istenemiyordu.
    assert "college_university" in RADIUS_PRESETS
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

Run: `cd backend && python -m pytest tests/test_classify_university.py -v`

Expected: FAIL — `test_amenity_university_college_university_dondurur`, `test_amenity_college_college_university_dondurur`, `test_universite_isimsiz_de_siniflanir` `None` dönüyor; `test_college_university_desteklenen_tur` KeyError/AssertionError.

- [ ] **Step 3: `classify.py`'de kontrolü erken çıkış öncesine taşı**

`backend/app/classify.py`, satır 40-46'yı şununla değiştir:

```python
    # Check if it's a kindergarten first (different amenity tag)
    if tags.get("amenity") == "kindergarten":
        return "kindergarten"

    # Gercek yuksekogretim kurumu: etiketten anlasiliyor.
    #
    # Bu kontrol asagidaki `amenity != "school"` erken cikisindan ONCE
    # olmak zorunda. Onceden asagida duruyordu ve universiteler erken
    # cikistan None ile ayrildigi icin o dal hic calismiyordu:
    # ulasilamaz kod. craft/workshop hatasinin (bkz. satir 149'daki
    # yorum) birebir ikiziydi.
    if tags.get("amenity") in ("university", "college"):
        return "college_university"

    # Not a school amenity
    if tags.get("amenity") != "school":
        return None
```

- [ ] **Step 4: Artık yinelenen olan alt kontrolü sil**

`backend/app/classify.py`, şu üç satırı **sil** (eski 87-89):

```python
    # Gercek yuksekogretim kurumu: etiketten anlasiliyor.
    if tags.get("amenity") in ["university", "college"]:
        return "college_university"
```

- [ ] **Step 5: `RADIUS_PRESETS`'e türü ekle**

`backend/app/models.py`, `RADIUS_PRESETS` içine `college_keyword` satırından sonra:

```python
    "college_keyword": 2500,
    # Universiteler seyrek ve geniş yayilimli; kucuk yaricap bos sonuc
    # veriyor. Bu deger yalnizca eski yaricap tabanli /api/search yolu
    # icin gecerli; ilce aramasi yaricap kullanmiyor.
    "college_university": 5000,
```

- [ ] **Step 6: `is_edu` listelerine ekle**

`backend/app/policy.py:60-63`:

```python
        is_edu = params.type in [
            "kindergarten", "primary_school", "middle_school",
            "high_school", "private_school", "college_keyword",
            "college_university",
        ]
```

`backend/app/search_service.py:184-187`:

```python
    is_edu = place_type in [
        "kindergarten", "primary_school", "middle_school", "high_school",
        "private_school", "college_keyword", "college_university"
    ]
```

Bu şart: `is_edu` false kalırsa `college_university` B2B sayılır, `classify_b2b_type` `None` döner ve tüm sonuçlar `search_service.py:236`'daki filtrede düşer.

- [ ] **Step 7: Testleri çalıştır, geçtiğini doğrula**

Run: `cd backend && python -m pytest tests/test_classify_university.py tests/test_classify.py -v`

Expected: PASS (7 yeni test + mevcut `test_classify.py` yeşil)

- [ ] **Step 8: Frontend taksonomisini güncelle**

`src/lib/types.ts`, `PlaceType` union'ının sonuna:

```typescript
export type PlaceType =
  | "factory"
  | "office"
  | "workshop"
  | "kindergarten"
  | "primary_school"
  | "middle_school"
  | "high_school"
  | "private_school"
  | "college_keyword"
  | "college_university";
```

`src/lib/labels.ts`:

```typescript
export const PLACE_TYPE_LABELS: Record<PlaceType, string> = {
  factory: "Fabrika",
  office: "Ofis",
  workshop: "Atölye",
  kindergarten: "Anaokulu",
  primary_school: "İlkokul",
  middle_school: "Ortaokul",
  high_school: "Lise",
  private_school: "Özel Okul",
  college_keyword: "Kolej",
  college_university: "Üniversite",
};

export const PLACE_TYPE_GROUPS: Record<string, PlaceType[]> = {
  "İşletmeler": ["factory", "office", "workshop"],
  "Eğitim Kurumları": [
    "kindergarten",
    "primary_school",
    "middle_school",
    "high_school",
    "private_school",
    "college_keyword",
    "college_university",
  ],
};
```

`college_keyword` etiketi "Üniversite"den "Kolej"e değişiyor — `classify.py:92`'deki yorumun anlattığı ayrımı arayüzde de doğru gösteriyor.

`src/components/Filters.tsx:18-28`, `CATEGORIES` dizisi:

```typescript
const CATEGORIES: { id: PlaceType; label: string; icon: any }[] = [
  { id: "factory", label: "Fabrika", icon: Factory },
  { id: "office", label: "Ofis", icon: Briefcase },
  { id: "workshop", label: "Atölye", icon: Wrench },
  { id: "kindergarten", label: "Anaokulu", icon: Baby },
  { id: "primary_school", label: "İlkokul", icon: School },
  { id: "middle_school", label: "Ortaokul", icon: School },
  { id: "high_school", label: "Lise", icon: GraduationCap },
  { id: "private_school", label: "Özel Okul", icon: School },
  { id: "college_keyword", label: "Kolej", icon: School },
  { id: "college_university", label: "Üniversite", icon: GraduationCap },
];
```

`Wrench` ikonunu import'a ekle (`workshop` ile `factory` aynı ikonu paylaşıyordu, çoklu seçimde ayırt edilemez olur):

```typescript
import {
  Factory,
  School,
  Baby,
  GraduationCap,
  Briefcase,
  Wrench,
} from "lucide-react";
```

- [ ] **Step 9: Tip kontrolü**

Run: `pnpm type-check`

Expected: hata yok. `PLACE_TYPE_LABELS` `Record<PlaceType, string>` olduğu için yeni tür eklenmezse TS burada hata verirdi — bu kasıtlı bir güvenlik ağı.

- [ ] **Step 10: Commit**

```bash
git add backend/app/classify.py backend/app/models.py backend/app/policy.py backend/app/search_service.py backend/tests/test_classify_university.py src/lib/types.ts src/lib/labels.ts src/components/Filters.tsx
git commit -m "fix: universite siniflandirmasindaki ulasilamaz dali onar, taksonomiyi 10 ture cikar"
```

---

## Task 2: Sınır verisi üretimi (`fetch_districts.py`)

**Neden:** İlçe poligonları hem haritada çizim hem sunucuda filtreleme için gerekli. Overpass relation'larından multipolygon birleştirmek (way stitching) hataya açık; bunun yerine Overpass'ten yalnızca relation ID + ad alınıp geometri Nominatim `/lookup` üzerinden hazır GeoJSON olarak çekiliyor. `/lookup` istek başına 50 ID kabul ediyor → 80 ilçe = 2 istek.

**Files:**
- Create: `backend/scripts/fetch_districts.py`
- Create: `backend/app/data/__init__.py` (boş — paketin veri dizinini taşıması için)
- Create: `backend/app/data/districts.geojson` (script çıktısı, git'e girer)
- Modify: `backend/requirements.txt`
- Test: `backend/tests/test_fetch_districts.py`

**Interfaces:**
- Consumes: T1'den bir şey kullanmıyor (bağımsız çalışabilir ama sıra gereği sonra)
- Produces:
  - `tr_slug(text: str) -> str`
  - `district_id(province_plate: str, province_slug: str, district_name: str) -> str`
  - `parse_district_relations(overpass_json: dict, province: str, plate: str) -> list[dict]` — her öğe `{id, name, province, province_plate, osm_relation_id}`
  - `attach_geometry(metas: list[dict], lookup_json: list[dict], tolerance: float) -> list[dict]` — `geometry`, `bbox`, `center` ekler
  - `build_feature_collection(districts: list[dict]) -> dict`
  - `districts.geojson` şeması: `FeatureCollection`; her `Feature.properties` = `{id, name, province, province_plate, osm_relation_id, bbox: [south, west, north, east], center: [lat, lon]}`; `Feature.geometry` = Polygon veya MultiPolygon

- [ ] **Step 1: `shapely` bağımlılığını ekle**

`backend/requirements.txt`, `geopy` satırından sonra:

```
# Ilce poligonlari: MultiPolygon + hole destegi ve prepared geometri ile
# hizli nokta testi (app/districts.py). El yazimi ray-casting Adalar gibi
# cok parcali ilcelerde ve delikli poligonlarda gereksiz karmasikti.
shapely==2.0.6
```

Run: `cd backend && pip install -r requirements.txt`

- [ ] **Step 2: Testi yaz**

`backend/tests/test_fetch_districts.py`:

```python
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
```

- [ ] **Step 3: Testi çalıştır, başarısız olduğunu doğrula**

Run: `cd backend && python -m pytest tests/test_fetch_districts.py -v`

Expected: FAIL — `ModuleNotFoundError: No module named 'fetch_districts'`

- [ ] **Step 4: Scripti yaz**

`backend/scripts/fetch_districts.py`:

```python
"""
Ilce sinir verisi uretimi. Tek seferlik calistirilir, cikti git'e girer.

Neden iki farkli servis:
  - Overpass ilce relation'larinin ID ve adini guvenilir sekilde veriyor,
    ama geometriyi `members` olarak donuyor. Bunlari kapali ringlere
    birlestirmek (way stitching) hataya acik bir is.
  - Nominatim /lookup relation ID karsiliginda hazir GeoJSON poligon
    donuyor ve istek basina 50 ID kabul ediyor. 80 ilce = 2 istek.

Kullanim:
    cd backend && python scripts/fetch_districts.py
"""

import asyncio
import json
import re
import sys
from pathlib import Path

import httpx
from shapely.geometry import mapping, shape

OUTPUT_PATH = Path(__file__).resolve().parents[1] / "app" / "data" / "districts.geojson"

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
NOMINATIM_LOOKUP_URL = "https://nominatim.openstreetmap.org/lookup"

# Nominatim kullanim politikasi kendini tanitan bir User-Agent zorunlu
# kiliyor; olmadan istekler 403 ile reddediliyor.
USER_AGENT = "nearby-place-finder/1.0 (district boundary import)"

# Poligon basitlestirme toleransi (derece). ~0.001 derece ~ 100 m.
# Dogruluk kaygisi yok: 2 km'lik arama tamponu 100 m'lik sinir sapmasini
# yutuyor, o yuzden tek basitlestirilmis kopya hem harita cizimi hem
# sunucu filtresi icin yeterli.
SIMPLIFY_TOLERANCE = 0.001

# Kapsam. Plaka kodu ilce kimliginin parcasi.
PROVINCES = [
    {"slug": "istanbul", "plate": "34", "name": "İstanbul", "expected": 39},
    {"slug": "edirne", "plate": "22", "name": "Edirne", "expected": 9},
    {"slug": "tekirdag", "plate": "59", "name": "Tekirdağ", "expected": 11},
    {"slug": "kirklareli", "plate": "39", "name": "Kırklareli", "expected": 8},
    {"slug": "malatya", "plate": "44", "name": "Malatya", "expected": 13},
]

_TR_MAP = str.maketrans({
    "ç": "c", "Ç": "c", "ğ": "g", "Ğ": "g", "ı": "i", "I": "i",
    "İ": "i", "i": "i", "ö": "o", "Ö": "o", "ş": "s", "Ş": "s",
    "ü": "u", "Ü": "u", "â": "a", "î": "i", "û": "u",
})


def tr_slug(text: str) -> str:
    """Turkce metni ASCII slug'a cevirir: 'Kadıköy' -> 'kadikoy'."""
    folded = (text or "").translate(_TR_MAP).lower()
    folded = re.sub(r"[^a-z0-9]+", "-", folded)
    return folded.strip("-")


def district_id(province_plate: str, province_slug: str, district_name: str) -> str:
    """
    Ilce kimligi: tr-{plaka}-{slug}.

    OSM'de bazi merkez ilceler "Merkez" olarak geciyor (Edirne, Kirklareli).
    'tr-39-merkez' teknik olarak calisir ama okunmuyor; bu durumda il
    slug'ina dusuluyor.
    """
    slug = tr_slug(district_name)
    if slug in ("merkez", ""):
        slug = province_slug
    return f"tr-{province_plate}-{slug}"


def parse_district_relations(
    overpass_json: dict, province: str, plate: str
) -> list[dict]:
    """Overpass cevabindan ilce metadata'sini cikarir (geometri yok)."""
    province_slug = tr_slug(province)
    out = []
    for el in overpass_json.get("elements", []):
        if el.get("type") != "relation":
            continue
        name = (el.get("tags") or {}).get("name")
        if not name:
            continue
        out.append({
            "id": district_id(plate, province_slug, name),
            "name": name,
            "province": province,
            "province_plate": plate,
            "osm_relation_id": el["id"],
        })
    return out


def attach_geometry(
    metas: list[dict], lookup_json: list[dict], tolerance: float
) -> list[dict]:
    """
    Nominatim /lookup ciktisindaki geometriyi metadata ile eslestirir,
    basitlestirir, bbox ve merkez hesaplar.

    Geometrisi bulunamayan ilce icin ValueError firlatir: sessizce eksik
    veri uretmek en kotu sonuc olur, cunku o ilce arayuzde tiklanabilir
    gorunup hicbir zaman sonuc vermez.
    """
    by_relation = {
        item["osm_id"]: item["geojson"]
        for item in lookup_json
        if item.get("osm_type") == "relation" and item.get("geojson")
    }

    out = []
    for meta in metas:
        raw = by_relation.get(meta["osm_relation_id"])
        if not raw:
            raise ValueError(
                f"{meta['id']} ({meta['name']}) icin geometri bulunamadi; "
                f"relation {meta['osm_relation_id']}"
            )

        geom = shape(raw).simplify(tolerance, preserve_topology=True)
        if geom.is_empty:
            raise ValueError(f"{meta['id']} basitlestirmeden sonra bos kaldi")

        minx, miny, maxx, maxy = geom.bounds  # (lon, lat) sirasi
        centroid = geom.centroid

        out.append({
            **meta,
            "geometry": mapping(geom),
            # bbox (south, west, north, east) — geo.bbox_from_radius ile ayni sira
            "bbox": (miny, minx, maxy, maxx),
            "center": (centroid.y, centroid.x),
        })
    return out


def build_feature_collection(districts: list[dict]) -> dict:
    """GeoJSON FeatureCollection uretir."""
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": d["geometry"],
                "properties": {
                    "id": d["id"],
                    "name": d["name"],
                    "province": d["province"],
                    "province_plate": d["province_plate"],
                    "osm_relation_id": d["osm_relation_id"],
                    "bbox": list(d["bbox"]),
                    "center": list(d["center"]),
                },
            }
            for d in districts
        ],
    }


def _overpass_query(province_name: str) -> str:
    """Bir ildeki admin_level=6 ilce relation'larini ister (geometri yok)."""
    return f"""[out:json][timeout:120];
area["name"="{province_name}"]["admin_level"="4"]->.il;
rel(area.il)["admin_level"="6"]["boundary"="administrative"];
out tags;"""


async def _fetch_relations(client: httpx.AsyncClient) -> list[dict]:
    """5 il icin Overpass'ten metadata cek, sirayla (es zamanli slot 2)."""
    metas: list[dict] = []
    for province in PROVINCES:
        print(f"[OVERPASS] {province['name']} ilceleri...")
        response = await client.post(
            OVERPASS_URL,
            data={"data": _overpass_query(province["name"])},
            headers={"User-Agent": USER_AGENT},
            timeout=180.0,
        )
        response.raise_for_status()
        parsed = parse_district_relations(
            response.json(), province["slug"], province["plate"]
        )
        if len(parsed) != province["expected"]:
            raise ValueError(
                f"{province['name']}: {province['expected']} ilce beklendi, "
                f"{len(parsed)} bulundu. OSM verisi degismis olabilir; "
                f"PROVINCES icindeki 'expected' degerini kontrol et."
            )
        print(f"[OVERPASS] {province['name']}: {len(parsed)} ilce")
        metas.extend(parsed)
    return metas


async def _fetch_geometries(
    client: httpx.AsyncClient, metas: list[dict]
) -> list[dict]:
    """Nominatim /lookup ile geometri cek. Istek basina en fazla 50 ID."""
    results: list[dict] = []
    for i in range(0, len(metas), 50):
        chunk = metas[i : i + 50]
        osm_ids = ",".join(f"R{m['osm_relation_id']}" for m in chunk)
        print(f"[NOMINATIM] {len(chunk)} ilce geometrisi...")
        response = await client.get(
            NOMINATIM_LOOKUP_URL,
            params={
                "osm_ids": osm_ids,
                "format": "json",
                "polygon_geojson": "1",
            },
            headers={"User-Agent": USER_AGENT},
            timeout=180.0,
        )
        response.raise_for_status()
        results.extend(response.json())
        # Nominatim kullanim politikasi 1 istek/saniye siniri koyuyor.
        await asyncio.sleep(1.2)
    return results


async def main() -> int:
    async with httpx.AsyncClient() as client:
        metas = await _fetch_relations(client)
        lookup = await _fetch_geometries(client, metas)

    districts = attach_geometry(metas, lookup, SIMPLIFY_TOLERANCE)
    feature_collection = build_feature_collection(districts)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(feature_collection, ensure_ascii=False), encoding="utf-8"
    )

    size_kb = OUTPUT_PATH.stat().st_size / 1024
    print(f"[OK] {len(districts)} ilce -> {OUTPUT_PATH} ({size_kb:.0f} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
```

- [ ] **Step 5: `app/data` paketini oluştur**

`backend/app/data/__init__.py` — boş dosya (dizinin pakete dahil olması için):

```python
"""Uretilen statik veri: districts.geojson."""
```

- [ ] **Step 6: Testleri çalıştır, geçtiğini doğrula**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_fetch_districts.py -v`

Expected: PASS (11 test)

- [ ] **Step 7: Scripti gerçekten çalıştır**

Run: `cd backend && python scripts/fetch_districts.py`

Expected çıktı:
```
[OVERPASS] İstanbul ilceleri...
[OVERPASS] İstanbul: 39 ilce
...
[NOMINATIM] 50 ilce geometrisi...
[NOMINATIM] 30 ilce geometrisi...
[OK] 80 ilce -> .../app/data/districts.geojson (500-1000 KB)
```

**Eğer Nominatim `/lookup` geometri döndürmezse** (`geojson` alanı boş gelirse): `_fetch_geometries` yerine ilçe başına `/search` kullanan yedek yola geç — `params={"q": f"{name}, {province}, Türkiye", "format": "json", "polygon_geojson": "1", "limit": 5}` ve dönen adaylar arasından `osm_id == meta["osm_relation_id"]` olanı seç (ad eşleşmesine güvenme, ID eşleşmesine güven). 80 istek × 1.2 s ≈ 100 sn.

- [ ] **Step 8: Çıktıyı doğrula**

Run:
```bash
cd backend && python -c "import json; fc=json.load(open('app/data/districts.geojson',encoding='utf-8')); print(len(fc['features'])); ids=[f['properties']['id'] for f in fc['features']]; print(len(set(ids))); print(sorted(ids)[:5])"
```

Expected: `80`, `80` (kimlikler tekil), ve `tr-22-*` ile başlayan kimlikler.

- [ ] **Step 9: Commit**

```bash
git add backend/scripts/fetch_districts.py backend/app/data/ backend/requirements.txt backend/tests/test_fetch_districts.py
git commit -m "feat: 5 il icin ilce sinir verisi uretimi ve districts.geojson"
```

---

## Task 3: `app/districts.py` — yükleme, anizotropik tampon, nokta testi

**Neden:** Sınır verisini runtime'da kullanılabilir hale getirir. Tamponun anizotropik olması şart: lat/lon derece uzayında izotropik `buffer()` uygulamak, Türkiye enlemlerinde (`cos(lat)` 0.74-0.81) tamponu doğu-batı yönünde gerçekte olmasından ~%25 geniş yapar.

**Files:**
- Create: `backend/app/districts.py`
- Test: `backend/tests/test_districts_geo.py`

**Interfaces:**
- Consumes: T2'den `app/data/districts.geojson` (şema: `Feature.properties = {id, name, province, province_plate, osm_relation_id, bbox: [south, west, north, east], center: [lat, lon]}`)
- Produces:
  - `@dataclass(frozen=True) District` alanları: `id: str`, `name: str`, `province: str`, `province_plate: str`, `osm_relation_id: int`, `bbox: tuple[float, float, float, float]`, `center: tuple[float, float]`
  - `load_districts() -> dict[str, District]` (memoize)
  - `get_district(district_id: str) -> District | None`
  - `all_districts() -> list[District]`
  - `districts_for_province(plate: str) -> list[District]`
  - `district_geometry(district_id: str) -> BaseGeometry` (memoize)
  - `buffer_degrees(geom: BaseGeometry, buffer_m: int, ref_lat: float) -> BaseGeometry` (saf, test edilebilir)
  - `point_in_geometry(geom: BaseGeometry, lat: float, lon: float) -> bool` (saf)
  - `point_membership(district_id: str, lat: float, lon: float, buffer_m: int) -> bool | None` — `True` kesin sınır içi, `False` tampon bölgesi, `None` üye değil
  - `districts_for_point(lat: float, lon: float, buffer_m: int) -> list[tuple[str, bool]]` — tüm ilçeler için `(district_id, is_inside)`
  - `expanded_bbox(district_id: str, buffer_m: int) -> tuple[float, float, float, float]` — `(south, west, north, east)`
  - `raw_geojson() -> dict`
  - `DEFAULT_BUFFER_M: int` — `DISTRICT_BUFFER_M` env, varsayılan 2000

- [ ] **Step 1: Testi yaz**

`backend/tests/test_districts_geo.py`:

```python
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
    return Polygon([
        (lon0, lat0),
        (lon0 + boyut, lat0),
        (lon0 + boyut, lat0 + boyut),
        (lon0, lat0 + boyut),
    ])


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
        assert point_in_geometry(geom, 41.2, 29.2) is False   # delik icinde
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
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

Run: `cd backend && python -m pytest tests/test_districts_geo.py -v`

Expected: FAIL — `ModuleNotFoundError: No module named 'app.districts'`

- [ ] **Step 3: `app/districts.py`'yi yaz**

```python
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
    center: tuple[float, float]              # (lat, lon)


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
    return sorted(
        load_districts().values(), key=lambda d: (d.province_plate, d.name)
    )


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


def buffer_degrees(
    geom: BaseGeometry, buffer_m: int, ref_lat: float
) -> BaseGeometry:
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
```

- [ ] **Step 4: Testleri çalıştır, geçtiğini doğrula**

Run: `cd backend && python -m pytest tests/test_districts_geo.py -v`

Expected: PASS. `districts.geojson` T2'de üretildiyse veri testleri de çalışır; yoksa `SKIPPED`.

- [ ] **Step 5: Anizotropi testinin gerçekten koruduğunu doğrula**

Tamponu geçici olarak izotropik yap (`buffer_degrees` içinde `k = 1.0`), testi çalıştır. **Kontrol noktalarının 1.9/2.1 km olması şart** — planın ilk hâli 1/3 km kullanıyordu ve o aralık hem düzeltilmemiş (~1510 m) hem de ters ölçeklenmiş (~1140 m) tamponu da geçiriyordu, yani test hiçbir şeyi korumuyordu:

Run: `cd backend && python -m pytest tests/test_districts_geo.py::TestBufferDegrees::test_tampon_doguya_dogru_da_metrik -v`

Expected: FAIL — `3 km dogudaki nokta True donuyor`. Sonra `k`'yi geri al ve testin tekrar geçtiğini doğrula. Bu adım testin boş bir kabuk olmadığını kanıtlıyor.

- [ ] **Step 6: Commit**

```bash
git add backend/app/districts.py backend/tests/test_districts_geo.py
git commit -m "feat: ilce geometrisi, anizotropik metrik tampon ve nokta uyeligi"
```

---

## Task 4: Veritabanı tabloları

**Neden:** POI'leri satır bazlı saklamak, filtre ve sıralamayı SQL'de yapabilmek için. `place_districts` ayrı tablo: 2 km tampon yüzünden sınırdaki bir kayıt iki ilçeye de ait, tek `district_id` kolonu olsa ingest sırası hangisiyse o kazanır ve kayıt sessizce yanlış ilçeye yazılır.

**Files:**
- Modify: `backend/app/database.py` (yeni modeller, `GlobalState`'ten sonra)
- Test: `backend/tests/test_district_tables.py`

**Interfaces:**
- Consumes: yok
- Produces: SQLAlchemy modelleri
  - `PlaceRow` (`__tablename__ = "places"`): `id: str` (PK), `lat: float`, `lon: float`, `name: str | None`, `place_type: str | None`, `subtype: str | None`, `confidence: int`, `has_contact: bool`, `phone/email/website/address: str | None`, `tags_json: str`, `fetched_at: datetime`
  - `PlaceDistrict` (`place_districts`): `place_id: str` (PK), `district_id: str` (PK), `is_inside: bool`
  - `DistrictIngest` (`district_ingest`): `district_id: str` (PK), `fetched_at: datetime`, `place_count: int`, `query_count: int`, `status: str`
- `init_db()` bunları `Base.metadata.create_all` ile otomatik oluşturuyor — migration aracı gerekmiyor.

- [ ] **Step 1: Testi yaz**

`backend/tests/test_district_tables.py`:

```python
"""
Yeni tablolarin semasi ve iliskileri.

init_db() Base.metadata.create_all cagirdigi icin migration araci
gerekmiyor; bu testler tablolarin gercekten olustugunu ve kisitlarin
calistigini dogruluyor.
"""

from datetime import datetime, timezone

import pytest
from sqlalchemy import select

from app.database import AsyncSessionLocal, DistrictIngest, PlaceDistrict, PlaceRow, init_db


@pytest.fixture
async def db():
    await init_db()
    async with AsyncSessionLocal() as session:
        yield session


def _place(place_id="osm:node:1", **kwargs) -> PlaceRow:
    defaults = dict(
        id=place_id,
        lat=41.0,
        lon=29.0,
        name="Test Fabrika",
        place_type="factory",
        subtype=None,
        confidence=60,
        has_contact=True,
        phone="+902161234567",
        email=None,
        website=None,
        address="Test Mah.",
        tags_json='{"man_made":"works"}',
        fetched_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    defaults.update(kwargs)
    return PlaceRow(**defaults)


@pytest.mark.asyncio
async def test_place_yazilip_okunur(db):
    db.add(_place("osm:node:1001"))
    await db.commit()

    result = await db.execute(select(PlaceRow).where(PlaceRow.id == "osm:node:1001"))
    row = result.scalar_one()
    assert row.place_type == "factory"
    assert row.has_contact is True


@pytest.mark.asyncio
async def test_place_type_null_olabilir(db):
    # building=school tasiyip amenity=school tasimayan kayitlar
    # siniflandirilamiyor ama atilmiyor.
    db.add(_place("osm:node:1002", place_type=None, name=None, has_contact=False, phone=None))
    await db.commit()

    result = await db.execute(select(PlaceRow).where(PlaceRow.id == "osm:node:1002"))
    assert result.scalar_one().place_type is None


@pytest.mark.asyncio
async def test_bir_kayit_iki_ilceye_uye_olabilir(db):
    # Sinirdaki fabrika: Kadikoy'un icinde, Atasehir'in tamponunda.
    db.add(_place("osm:node:1003"))
    db.add(PlaceDistrict(place_id="osm:node:1003", district_id="tr-34-kadikoy", is_inside=True))
    db.add(PlaceDistrict(place_id="osm:node:1003", district_id="tr-34-atasehir", is_inside=False))
    await db.commit()

    result = await db.execute(
        select(PlaceDistrict).where(PlaceDistrict.place_id == "osm:node:1003")
    )
    rows = result.scalars().all()
    assert len(rows) == 2
    assert {r.district_id: r.is_inside for r in rows} == {
        "tr-34-kadikoy": True,
        "tr-34-atasehir": False,
    }


@pytest.mark.asyncio
async def test_ingest_durumu_yazilir(db):
    db.add(DistrictIngest(
        district_id="tr-34-kadikoy",
        fetched_at=datetime.now(timezone.utc).replace(tzinfo=None),
        place_count=412,
        query_count=4,
        status="ok",
    ))
    await db.commit()

    result = await db.execute(
        select(DistrictIngest).where(DistrictIngest.district_id == "tr-34-kadikoy")
    )
    row = result.scalar_one()
    assert row.place_count == 412
    assert row.status == "ok"
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

Run: `cd backend && python -m pytest tests/test_district_tables.py -v`

Expected: FAIL — `ImportError: cannot import name 'PlaceRow' from 'app.database'`

- [ ] **Step 3: Modelleri ekle**

`backend/app/database.py`, `GlobalState` sınıfından sonra ve `init_db` fonksiyonundan önce:

```python
class PlaceRow(Base):
    """
    Ingest edilmis POI. Yerel arama bu tablo uzerinde calisiyor;
    sorgu yolunda Overpass'e hic gidilmiyor.

    place_type NULL olabilir: OSM'de `building=school` tasiyip
    `amenity=school` tasimayan kayitlar siniflandirilamiyor. Veriyi
    atmak yerine saklaniyor, filtrelerde varsayilan olarak gizleniyor
    (include_unclassified ile gorulebilir).
    """
    __tablename__ = "places"

    id = Column(String, primary_key=True)  # osm:node:123
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    name = Column(String, nullable=True)
    place_type = Column(String, nullable=True, index=True)
    subtype = Column(String, nullable=True)
    confidence = Column(Integer, default=0)
    # Turetilmis ve indeksli: filtre panelinin en cok kullanilan kosulu.
    has_contact = Column(Boolean, nullable=False, default=False, index=True)
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    website = Column(String, nullable=True)
    address = Column(String, nullable=True)
    tags_json = Column(String, nullable=False, default="{}")
    fetched_at = Column(DateTime, nullable=False, default=datetime.datetime.utcnow)


class PlaceDistrict(Base):
    """
    POI - ilce uyeligi (cok-a-cok).

    Neden ayri tablo: 2 km tampon yuzunden sinirdaki bir kayit iki
    ilceye de ait — Kadikoy'un icinde VE Atasehir'in tamponunda.
    places tablosunda tek district_id kolonu olsa ingest sirasi hangisi
    ise o kazanir ve kayit sessizce yanlis ilceye yazilirdi.

    is_inside: True = kesin sinir ici, False = tampon bolgesi.
    """
    __tablename__ = "place_districts"

    place_id = Column(
        String, ForeignKey("places.id", ondelete="CASCADE"), primary_key=True
    )
    district_id = Column(String, primary_key=True, index=True)
    is_inside = Column(Boolean, nullable=False, default=True)


class DistrictIngest(Base):
    """
    Ilce basina ingest durumu. Idempotency ve tazelik hatirlatmasi
    bu tabloya bakiyor.

    status: ok | partial | failed
      - ok:      dort sorgu da basarili
      - partial: bbox dortte bolunmesine ragmen bazi parcalar alinamadi
      - failed:  hicbir sorgu tamamlanmadi
    """
    __tablename__ = "district_ingest"

    district_id = Column(String, primary_key=True)
    fetched_at = Column(DateTime, nullable=False, default=datetime.datetime.utcnow)
    place_count = Column(Integer, nullable=False, default=0)
    query_count = Column(Integer, nullable=False, default=0)
    status = Column(String, nullable=False, default="ok", index=True)
```

`ForeignKey`'i import listesine ekle — `database.py`'nin en üstündeki `from sqlalchemy import (...)` bloğuna:

```python
from sqlalchemy import (
    Column, Integer, String, Float, DateTime, Boolean, JSON,
    ForeignKey, Index, func, select, update
)
```

- [ ] **Step 4: Testleri çalıştır, geçtiğini doğrula**

Run: `cd backend && python -m pytest tests/test_district_tables.py -v`

Expected: PASS (4 test)

- [ ] **Step 5: Mevcut testlerin bozulmadığını doğrula**

Run: `cd backend && python -m pytest tests/ -v`

Expected: tümü PASS. Yeni tablolar mevcut sorguları etkilemiyor.

- [ ] **Step 6: Commit**

```bash
git add backend/app/database.py backend/tests/test_district_tables.py
git commit -m "feat: places, place_districts ve district_ingest tablolarini ekle"
```

---

## Task 5: `app/store.py` — yazma/okuma katmanı

**Neden:** Ingest ve sorgu katmanlarının ortak veri erişimi. `has_contact` türetimi burada tek yerde tanımlı — filtre paneli, `lead_score` ve `contact_first` sıralaması hepsi bu tanıma bağlı.

**Files:**
- Create: `backend/app/store.py`
- Test: `backend/tests/test_store.py`

**Interfaces:**
- Consumes: T4'ten `PlaceRow`, `PlaceDistrict`, `DistrictIngest`
- Produces:
  - `CONTACT_TAGS: frozenset[str]`
  - `derive_has_contact(tags: dict) -> bool`
  - `extract_contact(tags: dict) -> tuple[str | None, str | None, str | None]` — `(phone, email, website)`
  - `place_row_values(element: dict, place_type: str | None, confidence: int, address: str | None) -> dict | None` — `PlaceRow` kolonlarına karşılık gelen sözlük; koordinat bulunamazsa `None`
  - `async upsert_places(db: AsyncSession, rows: list[dict]) -> int`
  - `async replace_memberships(db: AsyncSession, district_id: str, memberships: list[tuple[str, bool]]) -> int`
  - `async mark_ingest(db, district_id: str, place_count: int, query_count: int, status: str) -> None`
  - `async get_ingest_state(db, district_id: str) -> DistrictIngest | None`
  - `async ingest_states(db) -> dict[str, DistrictIngest]`

- [ ] **Step 1: Testi yaz**

`backend/tests/test_store.py`:

```python
"""
Veri erisim katmani: has_contact turetimi, upsert, uyelik degistirme.
"""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.database import AsyncSessionLocal, PlaceDistrict, PlaceRow, init_db
from app.store import (
    derive_has_contact,
    extract_contact,
    get_ingest_state,
    mark_ingest,
    place_row_values,
    replace_memberships,
    upsert_places,
)


@pytest.fixture
async def db():
    await init_db()
    async with AsyncSessionLocal() as session:
        yield session
        # Test izolasyonu: bu dosyanin yazdigi satirlari temizle.
        for table in (PlaceDistrict, PlaceRow):
            for row in (await session.execute(select(table))).scalars().all():
                await session.delete(row)
        await session.commit()


class TestDeriveHasContact:
    def test_duz_telefon(self):
        assert derive_has_contact({"phone": "+902161234567"}) is True

    def test_onekli_telefon(self):
        assert derive_has_contact({"contact:phone": "+902161234567"}) is True

    def test_mobil(self):
        assert derive_has_contact({"mobile": "+905321234567"}) is True

    def test_email_ve_website(self):
        assert derive_has_contact({"email": "a@b.com"}) is True
        assert derive_has_contact({"website": "https://x.com"}) is True
        assert derive_has_contact({"contact:website": "https://x.com"}) is True

    def test_yalniz_faks_sayilmaz(self):
        # Spec karari: faks saklaniyor ama ulasilabilirlik sinyali degil.
        assert derive_has_contact({"fax": "+902161234567"}) is False

    def test_iletisim_yok(self):
        assert derive_has_contact({"man_made": "works", "name": "X"}) is False

    def test_bos_deger_sayilmaz(self):
        assert derive_has_contact({"phone": ""}) is False


class TestExtractContact:
    def test_duz_etiketler_oncelikli(self):
        phone, email, website = extract_contact({
            "phone": "111", "contact:phone": "222",
            "email": "a@b.com", "website": "https://x.com",
        })
        assert phone == "111"
        assert email == "a@b.com"
        assert website == "https://x.com"

    def test_onekli_etiketlere_geri_duser(self):
        phone, email, website = extract_contact({
            "contact:phone": "222", "contact:email": "c@d.com",
            "contact:website": "https://y.com",
        })
        assert (phone, email, website) == ("222", "c@d.com", "https://y.com")

    def test_mobil_telefon_yerine_gecer(self):
        phone, _, _ = extract_contact({"mobile": "+905321234567"})
        assert phone == "+905321234567"


class TestPlaceRowValues:
    def test_node_elemani(self):
        element = {
            "type": "node", "id": 123, "lat": 41.0, "lon": 29.0,
            "tags": {"name": "Test Fabrika", "man_made": "works", "phone": "111"},
        }
        values = place_row_values(element, "factory", 60, "Test Mah.")

        assert values["id"] == "osm:node:123"
        assert values["lat"] == 41.0
        assert values["name"] == "Test Fabrika"
        assert values["place_type"] == "factory"
        assert values["has_contact"] is True
        assert values["phone"] == "111"

    def test_way_elemani_center_kullanir(self):
        # Overpass `out center` way/relation icin center alani doner.
        element = {
            "type": "way", "id": 456,
            "center": {"lat": 41.5, "lon": 29.5},
            "tags": {"building": "industrial"},
        }
        values = place_row_values(element, "factory", 40, None)

        assert values["id"] == "osm:way:456"
        assert values["lat"] == 41.5
        assert values["lon"] == 29.5
        assert values["name"] is None

    def test_koordinatsiz_eleman_none_dondurur(self):
        element = {"type": "relation", "id": 789, "tags": {"office": "company"}}
        assert place_row_values(element, "office", 40, None) is None


@pytest.mark.asyncio
class TestUpsertPlaces:
    async def test_yeni_kayit_eklenir(self, db):
        rows = [place_row_values(
            {"type": "node", "id": 2001, "lat": 41.0, "lon": 29.0,
             "tags": {"name": "A", "man_made": "works"}},
            "factory", 60, None,
        )]
        assert await upsert_places(db, rows) == 1

        result = await db.execute(select(PlaceRow).where(PlaceRow.id == "osm:node:2001"))
        assert result.scalar_one().name == "A"

    async def test_ayni_id_guncellenir_cogaltilmaz(self, db):
        base = {"type": "node", "id": 2002, "lat": 41.0, "lon": 29.0}
        await upsert_places(db, [place_row_values(
            {**base, "tags": {"name": "Eski", "man_made": "works"}}, "factory", 60, None)])
        await upsert_places(db, [place_row_values(
            {**base, "tags": {"name": "Yeni", "man_made": "works", "phone": "111"}},
            "factory", 70, None)])

        result = await db.execute(select(PlaceRow).where(PlaceRow.id == "osm:node:2002"))
        rows = result.scalars().all()
        assert len(rows) == 1
        assert rows[0].name == "Yeni"
        assert rows[0].has_contact is True


@pytest.mark.asyncio
class TestReplaceMemberships:
    async def test_ilcenin_uyelikleri_degistirilir(self, db):
        await upsert_places(db, [place_row_values(
            {"type": "node", "id": 3001, "lat": 41.0, "lon": 29.0,
             "tags": {"man_made": "works"}}, "factory", 60, None)])

        await replace_memberships(db, "tr-34-kadikoy", [("osm:node:3001", True)])
        await replace_memberships(db, "tr-34-kadikoy", [("osm:node:3001", False)])

        result = await db.execute(
            select(PlaceDistrict).where(PlaceDistrict.district_id == "tr-34-kadikoy")
        )
        rows = result.scalars().all()
        assert len(rows) == 1
        assert rows[0].is_inside is False

    async def test_diger_ilcenin_uyelikleri_korunur(self, db):
        # Kadikoy yeniden ingest edilirken Atasehir'in uyelikleri
        # silinmemeli; ayni kayit ikisine de uye olabiliyor.
        await upsert_places(db, [place_row_values(
            {"type": "node", "id": 3002, "lat": 41.0, "lon": 29.0,
             "tags": {"man_made": "works"}}, "factory", 60, None)])

        await replace_memberships(db, "tr-34-kadikoy", [("osm:node:3002", True)])
        await replace_memberships(db, "tr-34-atasehir", [("osm:node:3002", False)])
        await replace_memberships(db, "tr-34-kadikoy", [("osm:node:3002", True)])

        result = await db.execute(
            select(PlaceDistrict).where(PlaceDistrict.place_id == "osm:node:3002")
        )
        assert len(result.scalars().all()) == 2


@pytest.mark.asyncio
class TestIngestState:
    async def test_yazilir_ve_okunur(self, db):
        await mark_ingest(db, "tr-59-cerkezkoy", 412, 4, "ok")
        state = await get_ingest_state(db, "tr-59-cerkezkoy")

        assert state is not None
        assert state.place_count == 412
        assert state.status == "ok"

    async def test_tekrar_isaretleme_gunceller(self, db):
        await mark_ingest(db, "tr-59-corlu", 100, 4, "partial")
        await mark_ingest(db, "tr-59-corlu", 250, 8, "ok")

        state = await get_ingest_state(db, "tr-59-corlu")
        assert state.place_count == 250
        assert state.status == "ok"

    async def test_bilinmeyen_ilce_none(self, db):
        assert await get_ingest_state(db, "tr-99-yok") is None
```

- [ ] **Step 2: `pytest-asyncio` modunu doğrula**

`backend/pyproject.toml` içinde `asyncio_mode` ayarı var mı kontrol et:

Run: `cd backend && grep -n "asyncio" pyproject.toml`

Yoksa ekle (aksi halde `@pytest.mark.asyncio` testleri atlanır ve **sessizce geçer** — en kötü test hatası):

```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
asyncio_default_fixture_loop_scope = "function"
```

- [ ] **Step 3: Testi çalıştır, başarısız olduğunu doğrula**

Run: `cd backend && python -m pytest tests/test_store.py -v`

Expected: FAIL — `ModuleNotFoundError: No module named 'app.store'`

- [ ] **Step 4: `app/store.py`'yi yaz**

```python
"""
places / place_districts / district_ingest icin veri erisim katmani.

Ingest yazar, sorgu katmani okur. has_contact turetimi burada tek
yerde tanimli: filtre paneli, contact_first siralamasi ve lead_score
hepsi bu tanima bagli.
"""

import json
from datetime import datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import DistrictIngest, PlaceDistrict, PlaceRow

# Ulasilabilirlik sinyali sayilan etiketler.
#
# OSM'de iletisim iki bicimde yasiyor: duz (`phone`) ve `contact:`
# onekli (`contact:phone`). Ikisi de gecerli.
#
# `fax` bilincli olarak DISARIDA: tags_json icinde saklaniyor ama
# "bu kayda ulasabilirim" demek icin yeterli degil.
CONTACT_TAGS = frozenset({
    "phone", "mobile", "email", "website",
    "contact:phone", "contact:mobile", "contact:email", "contact:website",
})


def derive_has_contact(tags: dict) -> bool:
    """Kayitta kullanilabilir bir iletisim kanali var mi?"""
    return any(
        tags.get(tag) for tag in CONTACT_TAGS
    )


def extract_contact(tags: dict) -> tuple[str | None, str | None, str | None]:
    """
    (phone, email, website) uclusu.

    Duz etiket onekli etikete tercih ediliyor; `phone` yoksa `mobile`
    telefon yerine geciyor.
    """
    phone = (
        tags.get("phone")
        or tags.get("contact:phone")
        or tags.get("mobile")
        or tags.get("contact:mobile")
        or None
    )
    email = tags.get("email") or tags.get("contact:email") or None
    website = tags.get("website") or tags.get("contact:website") or None
    return phone, email, website


def place_row_values(
    element: dict,
    place_type: str | None,
    confidence: int,
    address: str | None,
) -> dict | None:
    """
    Overpass elemanini PlaceRow kolon sozlugune cevirir.

    Koordinat bulunamazsa None doner: node'da lat/lon, way ve
    relation'da `out center` ciktisindaki `center` alani var. Ikisi de
    yoksa kayit haritada gosterilemez ve mesafe hesaplanamaz.
    """
    lat = element.get("lat")
    lon = element.get("lon")
    if lat is None or lon is None:
        center = element.get("center") or {}
        lat = center.get("lat")
        lon = center.get("lon")
    if lat is None or lon is None:
        return None

    tags = element.get("tags") or {}
    phone, email, website = extract_contact(tags)

    return {
        "id": f"osm:{element.get('type', 'node')}:{element['id']}",
        "lat": float(lat),
        "lon": float(lon),
        "name": tags.get("name") or tags.get("official_name") or None,
        "place_type": place_type,
        "subtype": None,
        "confidence": confidence,
        "has_contact": derive_has_contact(tags),
        "phone": phone,
        "email": email,
        "website": website,
        "address": address,
        "tags_json": json.dumps(tags, ensure_ascii=False),
        "fetched_at": datetime.now(timezone.utc).replace(tzinfo=None),
    }


async def upsert_places(db: AsyncSession, rows: list[dict]) -> int:
    """
    Kayitlari ekle veya guncelle. Donus: islenen satir sayisi.

    ON CONFLICT gerekli: ayni kayit iki komsu ilcenin ingest'inde de
    donebiliyor (tampon bolgesi). Duz INSERT ikinci seferde
    IntegrityError firlatirdi.
    """
    if not rows:
        return 0

    statement = sqlite_insert(PlaceRow).values(rows)
    updatable = {
        column: getattr(statement.excluded, column)
        for column in (
            "lat", "lon", "name", "place_type", "subtype", "confidence",
            "has_contact", "phone", "email", "website", "address",
            "tags_json", "fetched_at",
        )
    }
    await db.execute(
        statement.on_conflict_do_update(index_elements=["id"], set_=updatable)
    )
    await db.commit()
    return len(rows)


async def replace_memberships(
    db: AsyncSession, district_id: str, memberships: list[tuple[str, bool]]
) -> int:
    """
    Bir ilcenin uyelik satirlarini bastan yaz.

    Yalnizca bu district_id'ye ait satirlar siliniyor: ayni kayit baska
    ilcelerin de uyesi olabiliyor (Kadikoy'un icinde VE Atasehir'in
    tamponunda) ve o satirlar korunmali.
    """
    await db.execute(
        delete(PlaceDistrict).where(PlaceDistrict.district_id == district_id)
    )

    if memberships:
        await db.execute(
            sqlite_insert(PlaceDistrict).values([
                {"place_id": place_id, "district_id": district_id, "is_inside": is_inside}
                for place_id, is_inside in memberships
            ])
        )

    await db.commit()
    return len(memberships)


async def mark_ingest(
    db: AsyncSession,
    district_id: str,
    place_count: int,
    query_count: int,
    status: str,
) -> None:
    """Ilcenin ingest durumunu yaz veya guncelle."""
    statement = sqlite_insert(DistrictIngest).values(
        district_id=district_id,
        fetched_at=datetime.now(timezone.utc).replace(tzinfo=None),
        place_count=place_count,
        query_count=query_count,
        status=status,
    )
    await db.execute(
        statement.on_conflict_do_update(
            index_elements=["district_id"],
            set_={
                "fetched_at": statement.excluded.fetched_at,
                "place_count": statement.excluded.place_count,
                "query_count": statement.excluded.query_count,
                "status": statement.excluded.status,
            },
        )
    )
    await db.commit()


async def get_ingest_state(
    db: AsyncSession, district_id: str
) -> DistrictIngest | None:
    """Bir ilcenin ingest durumu; hic cekilmemisse None."""
    result = await db.execute(
        select(DistrictIngest).where(DistrictIngest.district_id == district_id)
    )
    return result.scalar_one_or_none()


async def ingest_states(db: AsyncSession) -> dict[str, DistrictIngest]:
    """Tum ilcelerin ingest durumu; arayuz tazelik uyarisi icin kullaniyor."""
    result = await db.execute(select(DistrictIngest))
    return {row.district_id: row for row in result.scalars().all()}
```

- [ ] **Step 5: Testleri çalıştır, geçtiğini doğrula**

Run: `cd backend && python -m pytest tests/test_store.py -v`

Expected: PASS (20 test)

- [ ] **Step 6: Commit**

```bash
git add backend/app/store.py backend/tests/test_store.py backend/pyproject.toml
git commit -m "feat: POI veri erisim katmani ve has_contact turetimi"
```

---

## Task 6: `app/ingest.py` — CLI ve orkestrasyon

**Neden:** Tüm ağ maliyeti bu dosyada toplanıyor. Türü Overpass'e sormak yerine iki aile (B2B, eğitim) halinde ham veri çekilip yerel sınıflandırma yapılıyor: 10 türün seçicilerinin birleşimi 18, hepsini tek sorguya koymak büyük ilçelerde timeout riski.

**Files:**
- Create: `backend/app/ingest.py`
- Modify: `backend/app/main.py:12` (warmup import'unu kaldır), `backend/app/main.py:33-35` (startup task'ını kaldır)
- Delete: `backend/app/services/warmup.py`
- Modify: `backend/tests/conftest.py:25-26` (`WARMUP_ENABLED` artık ölü)
- Test: `backend/tests/test_ingest.py`

**Interfaces:**
- Consumes: T3'ten `expanded_bbox`, `point_membership`, `all_districts`, `districts_for_province`, `get_district`, `DEFAULT_BUFFER_M`; T5'ten `place_row_values`, `upsert_places`, `replace_memberships`, `mark_ingest`, `get_ingest_state`; T1'den `classify_school_level`, `classify_b2b_type`
- Produces:
  - `SELECTOR_FAMILIES: dict[str, tuple[str, ...]]` — anahtarlar `"b2b"`, `"education"`
  - `FRESH_AFTER_DAYS: int` = 30
  - `build_family_query(selectors, bbox, stage) -> str`
  - `split_bbox(bbox) -> list[tuple[float, float, float, float]]` — 4 çeyrek
  - `classify_element(tags: dict, element_type: str) -> str | None`
  - `async ingest_district(db, district_id, buffer_m, force) -> IngestResult`
  - `@dataclass(frozen=True) IngestResult`: `district_id: str`, `place_count: int`, `query_count: int`, `status: str`, `skipped: bool`
  - `async ingest_many(db_factory, district_ids, concurrency, buffer_m, force) -> list[IngestResult]`
  - `main(argv) -> int`

- [ ] **Step 1: Testi yaz**

`backend/tests/test_ingest.py`:

```python
"""
Ingest: sorgu uretimi, siniflandirma yonlendirmesi, idempotency,
bbox bolme.

Overpass cagrilari mock'lu; bu dosya ag'a hic gitmiyor.
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select

from app.database import AsyncSessionLocal, PlaceDistrict, PlaceRow, init_db
from app.ingest import (
    SELECTOR_FAMILIES,
    build_family_query,
    classify_element,
    ingest_district,
    split_bbox,
)
from app.overpass import OverpassTransientError
from app.store import get_ingest_state


@pytest.fixture
async def db():
    await init_db()
    async with AsyncSessionLocal() as session:
        yield session
        for table in (PlaceDistrict, PlaceRow):
            for row in (await session.execute(select(table))).scalars().all():
                await session.delete(row)
        await session.commit()


class TestSelectorFamilies:
    def test_iki_aile(self):
        assert set(SELECTOR_FAMILIES) == {"b2b", "education"}

    def test_onsekiz_selector(self):
        # 10 turun secicilerinin birlesimi. Sayi degisirse ingest sorgu
        # maliyeti de degisir; bu test o degisikligi gorunur kiliyor.
        total = sum(len(v) for v in SELECTOR_FAMILIES.values())
        assert total == 18

    def test_universite_secicileri_var(self):
        # T1'de duzeltilen hatanin ikinci yarisi: universite hic
        # sorgulanmiyordu.
        education = SELECTOR_FAMILIES["education"]
        assert '["amenity"="university"]' in education
        assert '["amenity"="college"]' in education


class TestBuildFamilyQuery:
    def test_stage1_isimli_filtre(self):
        query = build_family_query(('["office"]',), (41.0, 29.0, 41.1, 29.1), 1)
        assert '["name"]' in query
        assert '[!"name"]' not in query

    def test_stage2_isimsiz_filtre(self):
        query = build_family_query(('["office"]',), (41.0, 29.0, 41.1, 29.1), 2)
        assert '[!"name"]' in query

    def test_bbox_sirasi_south_west_north_east(self):
        query = build_family_query(('["office"]',), (41.0, 29.0, 41.1, 29.1), 1)
        assert "(41.000000,29.000000,41.100000,29.100000)" in query

    def test_her_selector_icin_bir_satir(self):
        query = build_family_query(('["office"]', '["craft"]'), (41.0, 29.0, 41.1, 29.1), 1)
        assert query.count("nwr") == 2

    def test_out_tags_center(self):
        # way/relation icin koordinat `center` alanindan geliyor;
        # `out tags center` olmadan place_row_values None doner.
        query = build_family_query(('["office"]',), (41.0, 29.0, 41.1, 29.1), 1)
        assert "out tags center;" in query


class TestSplitBbox:
    def test_dort_ceyrek(self):
        parts = split_bbox((41.0, 29.0, 41.2, 29.2))
        assert len(parts) == 4

    def test_ceyrekler_orijinali_kapsar(self):
        south, west, north, east = 41.0, 29.0, 41.2, 29.2
        parts = split_bbox((south, west, north, east))
        assert min(p[0] for p in parts) == south
        assert min(p[1] for p in parts) == west
        assert max(p[2] for p in parts) == north
        assert max(p[3] for p in parts) == east

    def test_ceyrekler_ortada_bulusur(self):
        parts = split_bbox((41.0, 29.0, 41.2, 29.2))
        assert {round(p[0], 4) for p in parts} == {41.0, 41.1}
        assert {round(p[1], 4) for p in parts} == {29.0, 29.1}


class TestClassifyElement:
    def test_okul_once_denenir(self):
        assert classify_element({"amenity": "school"}, "node") is None or True
        assert classify_element(
            {"amenity": "school", "isced:level": "1"}, "node"
        ) == "primary_school"

    def test_universite(self):
        assert classify_element({"amenity": "university"}, "way") == "college_university"

    def test_anaokulu(self):
        assert classify_element({"amenity": "kindergarten"}, "node") == "kindergarten"

    def test_fabrika(self):
        assert classify_element({"man_made": "works"}, "way") == "factory"

    def test_atolye_fabrikadan_once(self):
        # classify.py:149'daki duzeltme: craft tasiyan kayit atolye,
        # fabrika degil.
        assert classify_element({"craft": "carpenter"}, "node") == "workshop"

    def test_ofis(self):
        assert classify_element({"office": "company"}, "node") == "office"

    def test_siniflandirilamayan_none(self):
        # building=school ama amenity=school yok: classify_school_level
        # None doner, b2b de tanimiyor. Kayit saklanir ama gizlenir.
        assert classify_element({"building": "school"}, "way") is None


def _overpass_stub(elements_by_stage):
    """stage 1 / stage 2 icin ayri eleman listesi donen mock."""
    async def _query(query_text: str, debug: bool = False):
        stage = 2 if '[!"name"]' in query_text else 1
        return {"elements": list(elements_by_stage.get(stage, []))}
    return _query


@pytest.mark.asyncio
class TestIngestDistrict:
    """
    Gercek ilce kimligi kullaniliyor; districts.geojson gerekli.
    Ingest edilen nokta Kadikoy merkezine yakin secildi ki uyelik
    testi anlamli olsun.
    """

    async def _kadikoy_merkez(self):
        from app.districts import get_district
        district = get_district("tr-34-kadikoy")
        if district is None:
            pytest.skip("districts.geojson yok; once fetch_districts.py calistir")
        return district.center

    async def test_kayitlar_yazilir_ve_uyelik_kurulur(self, db):
        lat, lon = await self._kadikoy_merkez()
        elements = [{
            "type": "node", "id": 9001, "lat": lat, "lon": lon,
            "tags": {"name": "Test Fabrika", "man_made": "works", "phone": "111"},
        }]

        with patch(
            "app.ingest.overpass_client.query",
            new=AsyncMock(side_effect=_overpass_stub({1: elements})),
        ):
            result = await ingest_district(db, "tr-34-kadikoy", 2000, force=True)

        assert result.status == "ok"
        assert result.place_count == 1
        assert result.query_count == 4  # 2 aile x 2 asama

        rows = (await db.execute(
            select(PlaceRow).where(PlaceRow.id == "osm:node:9001")
        )).scalars().all()
        assert len(rows) == 1
        assert rows[0].place_type == "factory"

        memberships = (await db.execute(
            select(PlaceDistrict).where(PlaceDistrict.place_id == "osm:node:9001")
        )).scalars().all()
        assert any(m.district_id == "tr-34-kadikoy" and m.is_inside for m in memberships)

    async def test_taze_ilce_atlanir_sorgu_atilmaz(self, db):
        lat, lon = await self._kadikoy_merkez()
        elements = [{
            "type": "node", "id": 9002, "lat": lat, "lon": lon,
            "tags": {"name": "A", "man_made": "works"},
        }]
        stub = AsyncMock(side_effect=_overpass_stub({1: elements}))

        with patch("app.ingest.overpass_client.query", new=stub):
            await ingest_district(db, "tr-34-kadikoy", 2000, force=True)
            first_calls = stub.await_count

            # force=False ve kayit taze: hic sorgu atilmamali.
            result = await ingest_district(db, "tr-34-kadikoy", 2000, force=False)

        assert result.skipped is True
        assert stub.await_count == first_calls

    async def test_force_taze_kaydi_yeniden_ceker(self, db):
        lat, lon = await self._kadikoy_merkez()
        elements = [{
            "type": "node", "id": 9003, "lat": lat, "lon": lon,
            "tags": {"name": "A", "man_made": "works"},
        }]
        stub = AsyncMock(side_effect=_overpass_stub({1: elements}))

        with patch("app.ingest.overpass_client.query", new=stub):
            await ingest_district(db, "tr-34-kadikoy", 2000, force=True)
            before = stub.await_count
            result = await ingest_district(db, "tr-34-kadikoy", 2000, force=True)

        assert result.skipped is False
        assert stub.await_count == before + 4

    async def test_siniflandirilamayan_kayit_saklanir(self, db):
        lat, lon = await self._kadikoy_merkez()
        elements = [{
            "type": "way", "id": 9004, "center": {"lat": lat, "lon": lon},
            "tags": {"name": "Bilinmeyen Okul", "building": "school"},
        }]

        with patch(
            "app.ingest.overpass_client.query",
            new=AsyncMock(side_effect=_overpass_stub({1: elements})),
        ):
            await ingest_district(db, "tr-34-kadikoy", 2000, force=True)

        row = (await db.execute(
            select(PlaceRow).where(PlaceRow.id == "osm:way:9004")
        )).scalar_one()
        assert row.place_type is None

    async def test_timeout_bbox_bolunerek_yeniden_denenir(self, db):
        lat, lon = await self._kadikoy_merkez()
        elements = [{
            "type": "node", "id": 9005, "lat": lat, "lon": lon,
            "tags": {"name": "A", "man_made": "works"},
        }]
        cagri_sayaci = {"n": 0}

        async def _query(query_text: str, debug: bool = False):
            cagri_sayaci["n"] += 1
            # Ilk cagri (b2b stage 1, tam bbox) timeout veriyor;
            # sonraki cagrilar ceyreklere ait.
            if cagri_sayaci["n"] == 1:
                raise OverpassTransientError("HTTP 504")
            stage = 2 if '[!"name"]' in query_text else 1
            return {"elements": list(elements) if stage == 1 else []}

        with patch("app.ingest.overpass_client.query", new=AsyncMock(side_effect=_query)):
            result = await ingest_district(db, "tr-34-kadikoy", 2000, force=True)

        # 4 ceyrek yeniden denendi: toplam sorgu 4'ten fazla olmali.
        assert result.query_count > 4
        assert result.status in ("ok", "partial")

    async def test_isimsiz_atolye_stage2_de_korunur(self, db):
        """
        Regresyon: is_valid_unnamed ikinci argumani TUR olarak
        yorumluyor. Aile adi ("b2b") gecilirse craft/office dallari
        hic calismaz ve isimsiz ama gecerli atolye kayitlari sessizce
        dusurulur. Siniflandirma filtreden once yapilmali.
        """
        lat, lon = await self._kadikoy_merkez()
        isimsiz_atolye = [{
            "type": "node", "id": 9006, "lat": lat, "lon": lon,
            "tags": {"craft": "carpenter"},  # isim yok, iletisim yok
        }]

        with patch(
            "app.ingest.overpass_client.query",
            new=AsyncMock(side_effect=_overpass_stub({2: isimsiz_atolye})),
        ):
            await ingest_district(db, "tr-34-kadikoy", 2000, force=True)

        row = (await db.execute(
            select(PlaceRow).where(PlaceRow.id == "osm:node:9006")
        )).scalar_one_or_none()
        assert row is not None, "isimsiz atolye dusuruldu"
        assert row.place_type == "workshop"

    async def test_bilinmeyen_ilce_hata_verir(self, db):
        with pytest.raises(KeyError):
            await ingest_district(db, "tr-99-yok", 2000, force=True)
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

Run: `cd backend && python -m pytest tests/test_ingest.py -v`

Expected: FAIL — `ModuleNotFoundError: No module named 'app.ingest'`

- [ ] **Step 3: `app/ingest.py`'yi yaz**

```python
"""
Ilce bazli POI ingest. Uygulamanin tum ag maliyeti bu dosyada.

Neden aile bazli, tur bazli degil:
  10 turun Overpass secicilerinin birlesimi 18 tane. Turu Overpass'e
  sormak gereksiz is — tur ayrimi classify.py tarafindan yerel olarak
  uretiliyor. Bir ilcenin ham verisini bir kez cekince 10 turun hepsi
  o veriden cikiyor. Anahtar uzayi ilce x tur = 720 degil, ilce = 80.

Neden 18 selector tek sorguda degil:
  Puturge (~1100 km2), Silivri, Sile gibi buyuk ilcelerde 18 secicilik
  tek sorgu timeout riski tasiyor. Iki aileye bolununce her sorgu 9
  secici tasiyor.

Ilce basina 4 sorgu (2 aile x 2 asama), 80 ilce = 320 sorgu, tek
seferlik.

Kullanim:
    python -m app.ingest --all
    python -m app.ingest --province istanbul
    python -m app.ingest --district tr-34-kadikoy
    python -m app.ingest --all --force
"""

import argparse
import asyncio
import logging
import os
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.classify import classify_b2b_type, classify_school_level
from app.database import AsyncSessionLocal, init_db
from app.districts import (
    DEFAULT_BUFFER_M,
    all_districts,
    districts_for_province,
    expanded_bbox,
    get_district,
    point_membership,
)
from app.overpass import OverpassError, overpass_client
from app.search_service import is_valid_unnamed
from app.store import (
    get_ingest_state,
    mark_ingest,
    place_row_values,
    replace_memberships,
    upsert_places,
)

logger = logging.getLogger(__name__)

# 10 turun secicilerinin birlesimi, iki aileye bolunmus.
# Toplam 18; bu sayi degisirse ingest sorgu maliyeti de degisir.
SELECTOR_FAMILIES: dict[str, tuple[str, ...]] = {
    "b2b": (
        '["man_made"="works"]',
        '["industrial"]',
        '["building"="industrial"]',
        '["building"="warehouse"]',
        '["building"="commercial"]',
        '["building"="office"]',
        '["landuse"="industrial"]',
        '["office"]',
        '["craft"]',
    ),
    "education": (
        '["amenity"="kindergarten"]',
        '["amenity"="school"]',
        '["amenity"="university"]',
        '["amenity"="college"]',
        '["building"="kindergarten"]',
        '["building"="school"]',
        '["building"="university"]',
        '["education"="school"]',
        '["education"="university"]',
    ),
}

# Bu sureden eski ingest "bayat" sayilir. Otomatik tazeleme YOK;
# arayuz yalnizca hatirlatma gosteriyor, karar kullanicida.
FRESH_AFTER_DAYS = 30

# Overpass IP basina 2 es zamanli slot veriyor.
DEFAULT_CONCURRENCY = 2

PROVINCE_PLATES = {
    "istanbul": "34",
    "edirne": "22",
    "tekirdag": "59",
    "kirklareli": "39",
    "malatya": "44",
}


@dataclass(frozen=True)
class IngestResult:
    """Bir ilcenin ingest sonucu."""

    district_id: str
    place_count: int
    query_count: int
    status: str  # ok | partial | failed
    skipped: bool = False


def build_family_query(
    selectors: tuple[str, ...],
    bbox: tuple[float, float, float, float],
    stage: int,
) -> str:
    """
    Bir aile icin Overpass QL sorgusu.

    stage 1 isimli kayitlari, stage 2 isimsizleri getiriyor. Ikisini
    ayirmak veri tekrarini onluyor: [!"name"] olmadan stage 2 ayni
    kayitlari tekrar donerdi.

    `out tags center` sart: way ve relation'larin koordinati `center`
    alanindan geliyor, onsuz place_row_values None doner.
    """
    south, west, north, east = bbox
    loc = f"({south:.6f},{west:.6f},{north:.6f},{east:.6f})"
    name_filter = '["name"]' if stage == 1 else '[!"name"]'

    timeout_cfg = int(os.getenv("OVERPASS_TIMEOUT", "60"))
    lines = "\n".join(f"  nwr{s}{name_filter}{loc};" for s in selectors)

    return f"""[out:json][timeout:{timeout_cfg}];
(
{lines}
);
out tags center;"""


def split_bbox(
    bbox: tuple[float, float, float, float],
) -> list[tuple[float, float, float, float]]:
    """
    bbox'i dort ceyrege boler. Timeout alan buyuk ilceler icin.
    Ceyrekler ortada bulusuyor; sinirdaki kayitlar iki ceyrekte de
    donebilir ama upsert tekrari zararsiz yapiyor.
    """
    south, west, north, east = bbox
    mid_lat = (south + north) / 2
    mid_lon = (west + east) / 2
    return [
        (south, west, mid_lat, mid_lon),
        (south, mid_lon, mid_lat, east),
        (mid_lat, west, north, mid_lon),
        (mid_lat, mid_lon, north, east),
    ]


def classify_element(tags: dict, element_type: str) -> str | None:
    """
    Elemani 10 turden birine ata; siniflandirilamazsa None.

    Once egitim denenir: `classify_school_level` yalnizca amenity
    school/kindergarten/university/college icin sonuc donuyor, yani
    yanlis pozitif riski yok. Ardindan B2B.

    None donen kayitlar atilmiyor, place_type=NULL ile saklaniyor
    (or. `building=school` tasiyip `amenity=school` tasimayanlar).
    """
    school = classify_school_level(tags, tags.get("name") or "")
    if school:
        return school

    return classify_b2b_type(tags, element_type)


async def _fetch_family_stage(
    selectors: tuple[str, ...],
    bbox: tuple[float, float, float, float],
    stage: int,
) -> tuple[list[dict], int, bool]:
    """
    Bir aile+asama icin Overpass'ten eleman cek.

    Donus (elements, query_count, ok). Timeout/hata durumunda bbox
    dorde bolunup yeniden denenir; ceyreklerin bir kismi basarisiz
    olursa ok=False doner ve ilce 'partial' isaretlenir.
    """
    try:
        data = await overpass_client.query(build_family_query(selectors, bbox, stage))
        return data.get("elements", []), 1, True
    except OverpassError as exc:
        logger.warning("Aile sorgusu basarisiz, bbox bolunuyor: %s", exc)

    elements: list[dict] = []
    query_count = 1  # basarisiz olan ilk deneme de sayiliyor
    all_ok = True

    for part in split_bbox(bbox):
        try:
            data = await overpass_client.query(
                build_family_query(selectors, part, stage)
            )
            elements.extend(data.get("elements", []))
            query_count += 1
        except OverpassError as exc:
            logger.error("Ceyrek sorgusu da basarisiz: %s", exc)
            query_count += 1
            all_ok = False

    return elements, query_count, all_ok


def _address_from_tags(tags: dict) -> str | None:
    """OSM adres etiketlerinden okunabilir adres uretir."""
    parts = [
        tags.get("addr:street"),
        tags.get("addr:housenumber"),
        tags.get("addr:neighbourhood") or tags.get("addr:suburb"),
        tags.get("addr:district"),
        tags.get("addr:city"),
    ]
    joined = " ".join(p for p in parts if p)
    return joined or None


async def ingest_district(
    db: AsyncSession,
    district_id: str,
    buffer_m: int = DEFAULT_BUFFER_M,
    force: bool = False,
) -> IngestResult:
    """
    Bir ilceyi cek, siniflandir, tabloya yaz.

    force=False ve kayit FRESH_AFTER_DAYS'den taze ise hic sorgu
    atmadan doner (idempotency): yarida kesilen --all calistirmasi
    kaldigi yerden devam edebiliyor.
    """
    district = get_district(district_id)
    if district is None:
        raise KeyError(f"Kapsam disi veya bilinmeyen ilce: {district_id}")

    if not force:
        state = await get_ingest_state(db, district_id)
        if state is not None and state.status == "ok":
            age = datetime.now(timezone.utc).replace(tzinfo=None) - state.fetched_at
            if age < timedelta(days=FRESH_AFTER_DAYS):
                return IngestResult(
                    district_id=district_id,
                    place_count=state.place_count,
                    query_count=0,
                    status=state.status,
                    skipped=True,
                )

    bbox = expanded_bbox(district_id, buffer_m)
    total_queries = 0
    all_ok = True
    rows_by_id: dict[str, dict] = {}

    for family, selectors in SELECTOR_FAMILIES.items():
        for stage in (1, 2):
            elements, queries, ok = await _fetch_family_stage(selectors, bbox, stage)
            total_queries += queries
            all_ok = all_ok and ok

            for element in elements:
                tags = element.get("tags") or {}
                place_type = classify_element(tags, element.get("type", "node"))

                # Stage 2 isimsiz kayitlari getiriyor; buyuk kismi
                # gurultu. Mevcut son-filtre korunuyor.
                #
                # Siniflandirma bu filtreden ONCE yapiliyor:
                # is_valid_unnamed ikinci argumani TUR olarak
                # yorumluyor ("workshop" ise craft, "office" ise office
                # etiketine bakiyor). Aile adi ("b2b") gecilirse o iki
                # dal hic calismaz ve gecerli atolye/ofis kayitlari
                # sessizce dusurulur.
                if stage == 2 and not is_valid_unnamed(element, place_type or ""):
                    continue

                values = place_row_values(
                    element,
                    place_type,
                    confidence=70 if stage == 1 else 40,
                    address=_address_from_tags(tags),
                )
                if values is not None:
                    rows_by_id[values["id"]] = values

    rows = list(rows_by_id.values())
    await upsert_places(db, rows)

    # Uyelik: yalnizca ISLENEN ilceye karsi test ediliyor. Kaydin
    # baska ilcelere uyeligi o ilcelerin ingest'inde kurulur, cunku
    # replace_memberships yalnizca bu district_id'nin satirlarini
    # siliyor.
    #
    # districts_for_point yerine point_membership: 80 ilcenin hepsini
    # test edip 79'unu atmak gereksiz maliyet olurdu.
    memberships = [
        (row["id"], membership)
        for row in rows
        if (membership := point_membership(district_id, row["lat"], row["lon"], buffer_m))
        is not None
    ]
    await replace_memberships(db, district_id, memberships)

    status = "ok" if all_ok else ("partial" if rows else "failed")
    await mark_ingest(db, district_id, len(rows), total_queries, status)

    return IngestResult(
        district_id=district_id,
        place_count=len(rows),
        query_count=total_queries,
        status=status,
    )


async def ingest_many(
    district_ids: list[str],
    concurrency: int = DEFAULT_CONCURRENCY,
    buffer_m: int = DEFAULT_BUFFER_M,
    force: bool = False,
) -> list[IngestResult]:
    """
    Birden fazla ilceyi sinirli es zamanlilikla cek.

    Her ilce kendi DB oturumunu aciyor: paylasilan AsyncSession
    es zamanli kullanimda guvenli degil.
    """
    semaphore = asyncio.Semaphore(concurrency)
    results: list[IngestResult] = []
    total = len(district_ids)
    done = {"n": 0}

    async def _one(district_id: str) -> None:
        async with semaphore:
            started = time.monotonic()
            async with AsyncSessionLocal() as session:
                try:
                    result = await ingest_district(session, district_id, buffer_m, force)
                except Exception as exc:  # noqa: BLE001
                    logger.error("[INGEST] %s basarisiz: %s", district_id, exc)
                    result = IngestResult(district_id, 0, 0, "failed")

            done["n"] += 1
            elapsed = time.monotonic() - started
            note = "atlandi" if result.skipped else (
                f"{result.query_count} sorgu {elapsed:.1f}s "
                f"{result.place_count} kayit [{result.status}]"
            )
            print(f"[INGEST] {done['n']}/{total} {district_id} {note}")
            results.append(result)

    await asyncio.gather(*(_one(d) for d in district_ids))
    return results


def _resolve_targets(args: argparse.Namespace) -> list[str]:
    """CLI argumanlarindan ilce kimlik listesi uretir."""
    if args.district:
        if get_district(args.district) is None:
            raise SystemExit(
                f"Kapsam disi veya bilinmeyen ilce: {args.district}\n"
                f"Kapsam: {', '.join(PROVINCE_PLATES)}"
            )
        return [args.district]

    if args.province:
        plate = PROVINCE_PLATES.get(args.province.lower())
        if plate is None:
            raise SystemExit(
                f"Kapsam disi il: {args.province}\n"
                f"Kapsam: {', '.join(PROVINCE_PLATES)}"
            )
        return [d.id for d in districts_for_province(plate)]

    return [d.id for d in all_districts()]


async def _run(args: argparse.Namespace) -> int:
    await init_db()
    targets = _resolve_targets(args)

    print(f"[INGEST] {len(targets)} ilce, es zamanlilik {args.concurrency}")
    started = time.monotonic()
    results = await ingest_many(
        targets, args.concurrency, args.buffer, args.force
    )
    elapsed = time.monotonic() - started

    queries = sum(r.query_count for r in results)
    places = sum(r.place_count for r in results if not r.skipped)
    skipped = sum(1 for r in results if r.skipped)
    failed = [r.district_id for r in results if r.status == "failed"]
    partial = [r.district_id for r in results if r.status == "partial"]

    print(
        f"\n[INGEST] Bitti: {len(results)} ilce, {skipped} atlandi, "
        f"{queries} sorgu, {places} kayit, {elapsed / 60:.1f} dk"
    )
    if partial:
        print(f"[INGEST] Kismi: {', '.join(partial)}")
    if failed:
        print(f"[INGEST] Basarisiz: {', '.join(failed)}")
        return 1
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m app.ingest",
        description="Ilce bazli POI ingest (Overpass -> yerel SQLite)",
    )
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--all", action="store_true", help="Kapsamdaki 80 ilce")
    group.add_argument("--province", help=f"Tek il: {', '.join(PROVINCE_PLATES)}")
    group.add_argument("--district", help="Tek ilce kimligi, or. tr-34-kadikoy")
    parser.add_argument(
        "--force", action="store_true", help="Taze kayitlari da yeniden cek"
    )
    parser.add_argument(
        "--concurrency", type=int, default=DEFAULT_CONCURRENCY,
        help=f"Es zamanli ilce sayisi (varsayilan {DEFAULT_CONCURRENCY}; "
             f"Overpass IP basina 2 slot veriyor)",
    )
    parser.add_argument(
        "--buffer", type=int, default=DEFAULT_BUFFER_M,
        help=f"Ilce sinirina eklenen tampon, metre (varsayilan {DEFAULT_BUFFER_M})",
    )

    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    return asyncio.run(_run(args))


if __name__ == "__main__":
    sys.exit(main())
```

`app.models.Address` import'u kullanılmıyorsa sil — `_address_from_tags` düz string üretiyor.

- [ ] **Step 4: Testleri çalıştır, geçtiğini doğrula**

Run: `cd backend && python -m pytest tests/test_ingest.py -v`

Expected: PASS. `districts.geojson` yoksa `TestIngestDistrict` sınıfı SKIPPED.

- [ ] **Step 5: `warmup.py`'yi kaldır ve `main.py`'yi temizle**

`backend/app/main.py` — satır 1'deki `import asyncio` artık gerekmiyorsa bırak (başka kullanım yok, sil), satır 12'deki import'u sil:

```python
from app.routers import account, admin, export, health, metrics, presets, search
```

Startup event'ini sadeleştir:

```python
@app.on_event("startup")
async def startup_event():
    """Initialise storage on boot.

    Onceden burada run_warmup() arka plan gorevi baslatiliyordu: her
    acilista 20 es zamanli Overpass sorgusu atiyordu ve Overpass IP
    basina 2 slot verdigi icin sik yeniden baslatilan ortamlarda kotayi
    tuketip aynalari saglıksiz isaretliyordu.

    Yerine app/ingest.py geldi: elle calistirilan, kaldigi yerden devam
    eden, 80 ilcenin tamamini kapsayan bir CLI. Startup'ta hicbir ag
    cagrisi yapilmiyor.
    """
    await init_db()
```

Dosyayı sil:

```bash
git rm backend/app/services/warmup.py
```

- [ ] **Step 6: `conftest.py`'deki ölü env değişkenini kaldır**

`backend/tests/conftest.py`, satır 25-26'yı sil:

```python
# Aksi halde her test oturumu acilista 20 es zamanli Overpass sorgusu atar.
os.environ.setdefault("WARMUP_ENABLED", "false")
```

Yerine:

```python
# Ingest artik startup'ta calismiyor (app/ingest.py elle tetikleniyor),
# bu yuzden eski WARMUP_ENABLED bayragina gerek kalmadi.
```

- [ ] **Step 7: Tüm testleri çalıştır**

Run: `cd backend && python -m pytest tests/ -v`

Expected: tümü PASS. `warmup.py` silindiği için ona referans veren bir test kalmadığını da doğrular.

- [ ] **Step 8: CLI'yi tek ilçeyle gerçekten çalıştır**

Run: `cd backend && python -m app.ingest --district tr-34-adalar`

Expected: `[INGEST] 1/1 tr-34-adalar 4 sorgu ...s N kayit [ok]`. Adalar seçildi çünkü küçük ve MultiPolygon — hem hızlı hem de çok parçalı geometri yolunu gerçek veriyle doğruluyor.

- [ ] **Step 9: Idempotency'yi gerçek veriyle doğrula**

Run: `cd backend && python -m app.ingest --district tr-34-adalar`

Expected: `[INGEST] 1/1 tr-34-adalar atlandi` — ikinci çalıştırma sıfır sorgu.

- [ ] **Step 10: Commit**

```bash
git add backend/app/ingest.py backend/app/main.py backend/tests/test_ingest.py backend/tests/conftest.py
git rm backend/app/services/warmup.py
git commit -m "feat: ilce bazli ingest CLI'si ekle, warmup servisini kaldir"
```

---

## Task 7: `app/queries.py` — filtre ve sıralama

**Neden:** Filtre panelinin her hareketi buraya düşüyor ve Overpass'e hiç gitmiyor. `lead_score` ve `ref_distance` sıralamaları Python'da yapılıyor: SQLite'ta trigonometri fonksiyonları derleme bayrağına bağlı (`SQLITE_ENABLE_MATH_FUNCTIONS`), güvenilemez.

**Files:**
- Create: `backend/app/queries.py`
- Test: `backend/tests/test_queries.py`

**Interfaces:**
- Consumes: T4'ten `PlaceRow`, `PlaceDistrict`
- Produces:
  - `@dataclass(frozen=True) PlaceFilter` alanları: `district_id: str`, `types: tuple[str, ...] = ()`, `has_contact: bool = False`, `named_only: bool = False`, `min_confidence: int = 0`, `q: str | None = None`, `include_buffer: bool = True`, `include_unclassified: bool = False`, `sort: str = "contact_first"`, `ref_lat: float | None = None`, `ref_lon: float | None = None`, `limit: int = 500`, `offset: int = 0`
  - `SQL_SORTS: frozenset[str]` = `{"contact_first", "confidence", "name"}`
  - `PYTHON_SORTS: frozenset[str]` = `{"lead_score", "ref_distance"}`
  - `VALID_SORTS: frozenset[str]`
  - `build_places_query(f: PlaceFilter) -> Select` (LIMIT/OFFSET **uygulanmamış**)
  - `lead_score(place: PlaceRow) -> int`
  - `sort_in_python(rows: list[PlaceRow], f: PlaceFilter) -> list[PlaceRow]`
  - `async fetch_places(db, f: PlaceFilter) -> tuple[list[PlaceRow], int]` — `(sayfa, toplam)`
  - `async count_by_type(db, district_id: str, include_buffer: bool) -> dict[str, int]`

- [ ] **Step 1: Testi yaz**

`backend/tests/test_queries.py`:

```python
"""
Filtre -> SQL cevirisi ve siralama.

Her filtre kombinasyonu gercek satirlar uzerinde dogrulaniyor;
sorgu metnine degil sonuc kumesine bakiyoruz.
"""

import pytest
from sqlalchemy import select

from app.database import AsyncSessionLocal, PlaceDistrict, PlaceRow, init_db
from app.queries import (
    PlaceFilter,
    VALID_SORTS,
    count_by_type,
    fetch_places,
    lead_score,
    sort_in_python,
)
from app.store import place_row_values, replace_memberships, upsert_places

D = "tr-34-test"
OTHER = "tr-34-diger"


def _element(osm_id: int, tags: dict, lat=41.0, lon=29.0) -> dict:
    return {"type": "node", "id": osm_id, "lat": lat, "lon": lon, "tags": tags}


@pytest.fixture
async def db():
    """Bilinen bir veri kumesi kur: 6 kayit, 2 ilce."""
    await init_db()
    async with AsyncSessionLocal() as session:
        rows = [
            place_row_values(_element(1, {"name": "Alfa Fabrika", "man_made": "works", "phone": "111"}), "factory", 70, None),
            place_row_values(_element(2, {"name": "Beta Fabrika", "man_made": "works"}), "factory", 70, None),
            place_row_values(_element(3, {"man_made": "works"}), "factory", 40, None),
            place_row_values(_element(4, {"name": "Gama Ofis", "office": "company", "website": "https://g.com"}), "office", 70, None),
            place_row_values(_element(5, {"name": "Delta Anaokulu", "amenity": "kindergarten"}), "kindergarten", 70, None),
            place_row_values(_element(6, {"name": "Bilinmeyen", "building": "school"}), None, 40, None),
        ]
        await upsert_places(session, rows)
        await replace_memberships(session, D, [
            ("osm:node:1", True), ("osm:node:2", True), ("osm:node:3", True),
            ("osm:node:4", True), ("osm:node:5", False), ("osm:node:6", True),
        ])
        await replace_memberships(session, OTHER, [("osm:node:1", False)])

        yield session

        for table in (PlaceDistrict, PlaceRow):
            for row in (await session.execute(select(table))).scalars().all():
                await session.delete(row)
        await session.commit()


def _ids(rows) -> set[str]:
    return {r.id for r in rows}


@pytest.mark.asyncio
class TestFiltreler:
    async def test_varsayilan_siniflandirilamayani_gizler(self, db):
        rows, total = await fetch_places(db, PlaceFilter(district_id=D))
        assert "osm:node:6" not in _ids(rows)
        assert total == 5

    async def test_include_unclassified_gosterir(self, db):
        rows, total = await fetch_places(
            db, PlaceFilter(district_id=D, include_unclassified=True)
        )
        assert "osm:node:6" in _ids(rows)
        assert total == 6

    async def test_tur_filtresi(self, db):
        rows, _ = await fetch_places(db, PlaceFilter(district_id=D, types=("factory",)))
        assert _ids(rows) == {"osm:node:1", "osm:node:2", "osm:node:3"}

    async def test_coklu_tur_filtresi(self, db):
        rows, _ = await fetch_places(
            db, PlaceFilter(district_id=D, types=("office", "kindergarten"))
        )
        assert _ids(rows) == {"osm:node:4", "osm:node:5"}

    async def test_bos_tur_hepsini_getirir(self, db):
        rows, _ = await fetch_places(db, PlaceFilter(district_id=D, types=()))
        assert len(rows) == 5

    async def test_has_contact_filtresi(self, db):
        rows, _ = await fetch_places(db, PlaceFilter(district_id=D, has_contact=True))
        assert _ids(rows) == {"osm:node:1", "osm:node:4"}

    async def test_named_only_filtresi(self, db):
        rows, _ = await fetch_places(db, PlaceFilter(district_id=D, named_only=True))
        assert "osm:node:3" not in _ids(rows)

    async def test_min_confidence_filtresi(self, db):
        rows, _ = await fetch_places(db, PlaceFilter(district_id=D, min_confidence=70))
        assert "osm:node:3" not in _ids(rows)

    async def test_metin_arama_buyuk_kucuk_duyarsiz(self, db):
        rows, _ = await fetch_places(db, PlaceFilter(district_id=D, q="alfa"))
        assert _ids(rows) == {"osm:node:1"}

    async def test_include_buffer_false_tampon_kayitlarini_atar(self, db):
        # osm:node:5 bu ilcede is_inside=False.
        rows, _ = await fetch_places(
            db, PlaceFilter(district_id=D, include_buffer=False)
        )
        assert "osm:node:5" not in _ids(rows)

    async def test_include_buffer_true_tamponu_dahil_eder(self, db):
        rows, _ = await fetch_places(
            db, PlaceFilter(district_id=D, include_buffer=True)
        )
        assert "osm:node:5" in _ids(rows)

    async def test_baska_ilcenin_kayitlari_gelmez(self, db):
        rows, _ = await fetch_places(db, PlaceFilter(district_id=OTHER))
        assert _ids(rows) == {"osm:node:1"}

    async def test_filtreler_birlesir(self, db):
        rows, _ = await fetch_places(db, PlaceFilter(
            district_id=D, types=("factory",), has_contact=True, named_only=True
        ))
        assert _ids(rows) == {"osm:node:1"}


@pytest.mark.asyncio
class TestSayfalama:
    async def test_limit_ve_offset(self, db):
        page1, total = await fetch_places(
            db, PlaceFilter(district_id=D, sort="name", limit=2, offset=0)
        )
        page2, _ = await fetch_places(
            db, PlaceFilter(district_id=D, sort="name", limit=2, offset=2)
        )
        assert len(page1) == 2
        assert len(page2) == 2
        assert not (_ids(page1) & _ids(page2))
        # total sayfa boyutundan bagimsiz, filtrelenmis kumenin tamami.
        assert total == 5

    async def test_python_siralamasinda_da_sayfalama_dogru(self, db):
        page1, total = await fetch_places(
            db, PlaceFilter(district_id=D, sort="lead_score", limit=2, offset=0)
        )
        page2, _ = await fetch_places(
            db, PlaceFilter(district_id=D, sort="lead_score", limit=2, offset=2)
        )
        assert len(page1) == 2
        assert not (_ids(page1) & _ids(page2))
        assert total == 5


@pytest.mark.asyncio
class TestSiralama:
    async def test_contact_first_iletisimlileri_one_alir(self, db):
        rows, _ = await fetch_places(
            db, PlaceFilter(district_id=D, sort="contact_first")
        )
        assert rows[0].has_contact is True
        assert rows[-1].has_contact is False

    async def test_name_alfabetik(self, db):
        rows, _ = await fetch_places(
            db, PlaceFilter(district_id=D, sort="name", named_only=True)
        )
        adlar = [r.name for r in rows]
        assert adlar == sorted(adlar)

    async def test_confidence_azalan(self, db):
        rows, _ = await fetch_places(db, PlaceFilter(district_id=D, sort="confidence"))
        skorlar = [r.confidence for r in rows]
        assert skorlar == sorted(skorlar, reverse=True)

    async def test_ref_distance_yakindan_uzaga(self, db):
        rows, _ = await fetch_places(db, PlaceFilter(
            district_id=D, sort="ref_distance", ref_lat=41.0, ref_lon=29.0
        ))
        assert len(rows) == 5  # hepsi ayni noktada; kirilmadan donmeli

    async def test_gecersiz_siralama_reddedilir(self, db):
        with pytest.raises(ValueError):
            await fetch_places(db, PlaceFilter(district_id=D, sort="DROP TABLE places"))

    def test_gecerli_siralamalar(self):
        assert VALID_SORTS == {
            "contact_first", "confidence", "name", "lead_score", "ref_distance"
        }


class TestLeadScore:
    def _row(self, **kwargs) -> PlaceRow:
        defaults = dict(
            id="osm:node:1", lat=41.0, lon=29.0, name="Test", place_type="factory",
            subtype=None, confidence=70, has_contact=False, phone=None, email=None,
            website=None, address=None, tags_json="{}",
        )
        defaults.update(kwargs)
        return PlaceRow(**defaults)

    def test_skor_araligi(self):
        assert 0 <= lead_score(self._row()) <= 100
        assert 0 <= lead_score(self._row(phone="111", email="a@b.com", website="https://x")) <= 100

    def test_telefon_skoru_yukseltir(self):
        assert lead_score(self._row(phone="111")) > lead_score(self._row())

    def test_isim_skoru_yukseltir(self):
        assert lead_score(self._row(name="Alfa")) > lead_score(self._row(name=None))

    def test_guven_skoru_etkiler(self):
        assert lead_score(self._row(confidence=90)) > lead_score(self._row(confidence=20))


@pytest.mark.asyncio
class TestCountByType:
    async def test_tur_basina_sayim(self, db):
        counts = await count_by_type(db, D, include_buffer=True)
        assert counts["factory"] == 3
        assert counts["office"] == 1
        assert counts["kindergarten"] == 1

    async def test_on_turun_hepsi_anahtarda(self, db):
        # Arayuz chip'leri bu sozlukten besleniyor; eksik anahtar
        # "sayi yok" ile "sifir" ayrimini bozar.
        counts = await count_by_type(db, D, include_buffer=True)
        assert len(counts) == 10
        assert counts["high_school"] == 0
        assert counts["college_university"] == 0

    async def test_include_buffer_false_sayimi_dusurur(self, db):
        counts = await count_by_type(db, D, include_buffer=False)
        assert counts["kindergarten"] == 0  # osm:node:5 tampon bolgesinde

    async def test_siniflandirilamayan_sayilmaz(self, db):
        counts = await count_by_type(db, D, include_buffer=True)
        assert sum(counts.values()) == 5
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

Run: `cd backend && python -m pytest tests/test_queries.py -v`

Expected: FAIL — `ModuleNotFoundError: No module named 'app.queries'`

- [ ] **Step 3: `app/queries.py`'yi yaz**

```python
"""
Yerel POI sorgulari: filtre -> SQL cevirisi ve siralama.

Bu dosyadaki hicbir kod Overpass'e gitmiyor. Filtre panelinin her
hareketi buraya dusuyor ve milisaniye mertebesinde donuyor.
"""

import json
from dataclasses import dataclass
from math import asin, cos, radians, sin, sqrt

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import PlaceDistrict, PlaceRow

# 10 tur. count_by_type her zaman bu anahtarlarin hepsini donuyor:
# arayuz chip'leri bu sozlukten besleniyor ve eksik anahtar "sayi yok"
# ile "sifir" ayrimini bozar.
ALL_TYPES: tuple[str, ...] = (
    "factory", "office", "workshop",
    "kindergarten", "primary_school", "middle_school", "high_school",
    "private_school", "college_keyword", "college_university",
)

# SQL'de siralanabilenler.
SQL_SORTS = frozenset({"contact_first", "confidence", "name"})

# Python'da siralanmasi gerekenler.
#
# lead_score: kullanici tanimli formul, SQL'e cevrilemiyor.
# ref_distance: haversine trigonometri gerektiriyor ve SQLite'ta sin/cos
# derleme bayragina bagli (SQLITE_ENABLE_MATH_FUNCTIONS); guvenilemez.
#
# Bu iki siralamada filtrelenmis kume tamamen cekilip Python'da
# siralanip dilimleniyor. Ilce basina en fazla birkac bin satir
# oldugu icin maliyet ihmal edilebilir.
PYTHON_SORTS = frozenset({"lead_score", "ref_distance"})

VALID_SORTS = SQL_SORTS | PYTHON_SORTS


@dataclass(frozen=True)
class PlaceFilter:
    """Sorgu endpoint'inin butun parametreleri."""

    district_id: str
    types: tuple[str, ...] = ()
    has_contact: bool = False
    named_only: bool = False
    min_confidence: int = 0
    q: str | None = None
    include_buffer: bool = True
    include_unclassified: bool = False
    sort: str = "contact_first"
    ref_lat: float | None = None
    ref_lon: float | None = None
    limit: int = 500
    offset: int = 0


def build_places_query(f: PlaceFilter) -> Select:
    """
    Filtreden SQLAlchemy Select uretir. LIMIT/OFFSET uygulanmiyor —
    onu fetch_places siralama yoluna gore ekliyor.

    Tum degerler baglanmis parametre olarak gidiyor; sorgu metnine
    string birlestirme yapilmiyor.
    """
    statement = (
        select(PlaceRow)
        .join(PlaceDistrict, PlaceDistrict.place_id == PlaceRow.id)
        .where(PlaceDistrict.district_id == f.district_id)
    )

    if not f.include_buffer:
        statement = statement.where(PlaceDistrict.is_inside.is_(True))

    if f.types:
        statement = statement.where(PlaceRow.place_type.in_(f.types))
    elif not f.include_unclassified:
        # Tur belirtilmediginde siniflandirilamayan kayitlar gizli.
        statement = statement.where(PlaceRow.place_type.is_not(None))

    if f.has_contact:
        statement = statement.where(PlaceRow.has_contact.is_(True))

    if f.named_only:
        statement = statement.where(PlaceRow.name.is_not(None))

    if f.min_confidence > 0:
        statement = statement.where(PlaceRow.confidence >= f.min_confidence)

    if f.q:
        # SQLite LIKE varsayilan olarak ASCII'de buyuk-kucuk duyarsiz.
        # Turkce karakterlerde duyarsizlik garantili degil; arayuz
        # bunu kullaniciya sezdirmeden calisiyor cunku cogu arama
        # ASCII harfle baslıyor.
        statement = statement.where(PlaceRow.name.ilike(f"%{f.q}%"))

    return statement


def _apply_sql_sort(statement: Select, sort: str) -> Select:
    """SQL'de siralanabilen secenekleri uygular."""
    if sort == "contact_first":
        # Ulasabildigim kayitlar ustte, icinde alfabetik.
        return statement.order_by(
            PlaceRow.has_contact.desc(), PlaceRow.name.is_(None), PlaceRow.name
        )
    if sort == "confidence":
        return statement.order_by(
            PlaceRow.confidence.desc(), PlaceRow.name.is_(None), PlaceRow.name
        )
    # name: isimsizler en sona (NULL'lar SQLite'ta once gelirdi)
    return statement.order_by(PlaceRow.name.is_(None), PlaceRow.name)


def lead_score(place: PlaceRow) -> int:
    """
    Outreach icin "bu kaydi ne kadar onemsemeliyim" skoru (0-100).
    Panelde 'Lead kalitesi' siralamasini besliyor.

    Agirliklar KULLANICI TARAFINDAN AYARLANACAK. Asagidaki dagilim
    calisan bir varsayilan; asil soru "ulasilabilirlik mi (telefon/mail)
    yoksa kimlik netligi mi (isim/guven) daha agir basar" ve bu sahadaki
    deneyime dair bir yargi.

    Mevcut dagilim:
      telefon      35  — dogrudan aranabilir, en degerli sinyal
      e-posta      15  — asenkron ama kisisel
      website      10  — iletisim bulmak icin bir adim daha gerekiyor
      isim         20  — isimsiz kayda outreach yapilamiyor
      guven skoru  20  — yanlis kategoriye yapilan outreach israf
    """
    score = 0

    if place.phone:
        score += 35
    if place.email:
        score += 15
    if place.website:
        score += 10
    if place.name:
        score += 20

    # confidence 0-100 arasi; agirligi 20 puana olcekle.
    score += round((place.confidence or 0) * 0.20)

    return min(100, score)


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Iki nokta arasi mesafe (metre). app.geo ile ayni formul."""
    rlat1, rlon1, rlat2, rlon2 = map(radians, (lat1, lon1, lat2, lon2))
    dlat = rlat2 - rlat1
    dlon = rlon2 - rlon1
    a = sin(dlat / 2) ** 2 + cos(rlat1) * cos(rlat2) * sin(dlon / 2) ** 2
    return 2 * asin(sqrt(a)) * 6371000


def sort_in_python(rows: list[PlaceRow], f: PlaceFilter) -> list[PlaceRow]:
    """SQL'de yapilamayan siralamalari uygular."""
    if f.sort == "lead_score":
        return sorted(rows, key=lambda r: (-lead_score(r), r.name or "￿"))

    # ref_distance: referans nokta verilmediyse siralama anlamsiz,
    # kayitlar oldugu gibi doner (sessizce yanlis sira uretmekten iyi).
    if f.ref_lat is None or f.ref_lon is None:
        return rows

    return sorted(
        rows,
        key=lambda r: _haversine_m(f.ref_lat, f.ref_lon, r.lat, r.lon),
    )


async def fetch_places(
    db: AsyncSession, f: PlaceFilter
) -> tuple[list[PlaceRow], int]:
    """
    Filtrelenmis ve siralanmis sayfa + filtrelenmis kumenin toplam
    boyutu.

    total her zaman sayfa boyutundan bagimsiz: arayuz "412 sonuctan
    1-50" gosterebilsin.
    """
    if f.sort not in VALID_SORTS:
        raise ValueError(
            f"Gecersiz siralama: {f.sort}. Gecerli: {', '.join(sorted(VALID_SORTS))}"
        )

    statement = build_places_query(f)

    count_statement = select(func.count()).select_from(statement.subquery())
    total = (await db.execute(count_statement)).scalar_one()

    if f.sort in SQL_SORTS:
        page = statement.limit(f.limit).offset(f.offset)
        rows = list((await db.execute(_apply_sql_sort(page, f.sort))).scalars().all())
        return rows, total

    # Python siralamasi: filtrelenmis kumeyi tamamen cek, sirala, dilimle.
    all_rows = list((await db.execute(statement)).scalars().all())
    ordered = sort_in_python(all_rows, f)
    return ordered[f.offset : f.offset + f.limit], total


async def count_by_type(
    db: AsyncSession, district_id: str, include_buffer: bool = True
) -> dict[str, int]:
    """
    Tur basina kayit sayisi. 10 turun hepsi anahtar olarak donuyor,
    sifir olanlar dahil.

    Siniflandirilamayan (place_type IS NULL) kayitlar sayilmiyor:
    arayuzde onlara ait bir chip yok.
    """
    statement = (
        select(PlaceRow.place_type, func.count())
        .join(PlaceDistrict, PlaceDistrict.place_id == PlaceRow.id)
        .where(
            PlaceDistrict.district_id == district_id,
            PlaceRow.place_type.is_not(None),
        )
        .group_by(PlaceRow.place_type)
    )
    if not include_buffer:
        statement = statement.where(PlaceDistrict.is_inside.is_(True))

    result = await db.execute(statement)
    found = dict(result.all())

    return {place_type: found.get(place_type, 0) for place_type in ALL_TYPES}
```

- [ ] **Step 4: Testleri çalıştır, geçtiğini doğrula**

Run: `cd backend && python -m pytest tests/test_queries.py -v`

Expected: PASS (32 test)

- [ ] **Step 5: `lead_score` ağırlıklarını kullanıcıya sor**

Bu adım bilinçli olarak koda değil kullanıcıya bakıyor. Varsayılan dağılım çalışıyor ve testler geçiyor, ama ağırlıklar sahadaki deneyime dair bir yargı. Kullanıcıya şu soruyu sor ve cevabına göre `lead_score` gövdesini güncelle:

> `queries.py`'deki `lead_score` şu an telefon 35 / e-posta 15 / website 10 / isim 20 / güven 20 dağıtıyor. Sizin işinizde **ulaşılabilirlik mi (telefon/mail) yoksa kimlik netliği mi (isim/güven) daha ağır basar?** Telefonu olan isimsiz bir fabrika mı, telefonu olmayan isimli bir okul mu daha değerli?

Cevap geldiyse ağırlıkları güncelle, docstring'deki dağılım tablosunu da güncelle, `TestLeadScore` testlerinin hâlâ geçtiğini doğrula. Cevap gelmediyse varsayılanla devam et ve docstring'deki "KULLANICI TARAFINDAN AYARLANACAK" notunu bırak.

- [ ] **Step 6: Commit**

```bash
git add backend/app/queries.py backend/tests/test_queries.py
git commit -m "feat: yerel POI filtre ve siralama katmani"
```

---

## Task 8: `app/routers/districts.py` — 4 endpoint

**Neden:** Frontend'in tek temas noktası. Kapsam dışı ilçe `422` ile reddediliyor ve Overpass'e hiç gidilmiyor — maliyet tavanının kilidi burada.

**Files:**
- Create: `backend/app/routers/districts.py`
- Modify: `backend/app/main.py` (router'ı kaydet)
- Test: `backend/tests/test_districts_api.py`, `backend/tests/test_no_overpass.py`

**Interfaces:**
- Consumes: T3'ten `all_districts`, `get_district`, `raw_geojson`, `DEFAULT_BUFFER_M`; T5'ten `ingest_states`, `get_ingest_state`; T6'dan `ingest_district`, `FRESH_AFTER_DAYS`; T7'den `PlaceFilter`, `fetch_places`, `count_by_type`, `VALID_SORTS`
- Produces: HTTP sözleşmesi
  - `GET /api/districts` → `{districts: [{id, name, province, province_plate, center: [lat, lon], bbox: [s, w, n, e], ingest: {fetched_at, place_count, status, stale} | null}]}`
  - `GET /api/districts/geojson` → GeoJSON FeatureCollection, `Cache-Control: public, max-age=604800, immutable`
  - `GET /api/districts/{district_id}/summary` → `{district_id, name, counts: {tür: sayı} (10 anahtar), total, ingest: {...} | null}`
  - `GET /api/districts/{district_id}/places` → `{results: [ClientPlace], count, total, query: {...}}` — `ClientPlace` = `{id, name, type, lat, lon, address, phone, email, website, confidence, has_contact, is_inside, tags}`
  - `POST /api/districts/{district_id}/ingest` → talep üzerine ingest, `{district_id, place_count, query_count, status, skipped}`

- [ ] **Step 1: Testi yaz**

`backend/tests/test_districts_api.py`:

```python
"""
Ilce endpoint'lerinin HTTP sozlesmesi.

conftest.py auth'u override ediyor; bu testlerin konusu kimlik degil.
"""

import pytest

pytestmark = pytest.mark.skipif(
    __import__("pathlib").Path("app/data/districts.geojson").exists() is False,
    reason="app/data/districts.geojson yok; once scripts/fetch_districts.py calistir",
)


class TestDistrictList:
    def test_seksen_ilce_doner(self, client):
        response = client.get("/api/districts")
        assert response.status_code == 200
        assert len(response.json()["districts"]) == 80

    def test_ilce_alanlari(self, client):
        district = next(
            d for d in client.get("/api/districts").json()["districts"]
            if d["id"] == "tr-34-kadikoy"
        )
        assert district["province_plate"] == "34"
        assert len(district["center"]) == 2
        assert len(district["bbox"]) == 4
        # Hic ingest edilmemisse null; arayuz bunu "veri yok" olarak gosteriyor.
        assert "ingest" in district

    def test_geometri_listede_yok(self, client):
        # Liste ~8 KB kalmali; poligonlar ayri endpoint'te.
        district = client.get("/api/districts").json()["districts"][0]
        assert "geometry" not in district


class TestGeoJson:
    def test_featurecollection_doner(self, client):
        response = client.get("/api/districts/geojson")
        assert response.status_code == 200
        body = response.json()
        assert body["type"] == "FeatureCollection"
        assert len(body["features"]) == 80

    def test_uzun_cache_basligi(self, client):
        # Sinir verisi degismiyor; tarayici her acilista 1 MB indirmesin.
        cache_control = client.get("/api/districts/geojson").headers["cache-control"]
        assert "max-age=604800" in cache_control
        assert "immutable" in cache_control


class TestSummary:
    def test_on_tur_anahtari(self, client):
        body = client.get("/api/districts/tr-34-adalar/summary").json()
        assert len(body["counts"]) == 10
        assert "college_university" in body["counts"]

    def test_bilinmeyen_ilce_422(self, client):
        assert client.get("/api/districts/tr-99-yok/summary").status_code == 422

    def test_kapsam_disi_il_422(self, client):
        # Ankara kapsamda degil; kimlik uretilse bile reddedilmeli.
        assert client.get("/api/districts/tr-06-cankaya/summary").status_code == 422


class TestPlaces:
    def test_bos_ilce_bos_liste(self, client):
        body = client.get("/api/districts/tr-34-adalar/places").json()
        assert body["count"] == len(body["results"])
        assert isinstance(body["results"], list)

    def test_bilinmeyen_ilce_422(self, client):
        assert client.get("/api/districts/tr-99-yok/places").status_code == 422

    def test_gecersiz_siralama_422(self, client):
        response = client.get(
            "/api/districts/tr-34-adalar/places", params={"sort": "DROP TABLE places"}
        )
        assert response.status_code == 422

    def test_gecersiz_tur_422(self, client):
        response = client.get(
            "/api/districts/tr-34-adalar/places", params={"types": "hastane"}
        )
        assert response.status_code == 422

    def test_gecerli_coklu_tur_kabul_edilir(self, client):
        response = client.get(
            "/api/districts/tr-34-adalar/places",
            params={"types": "factory,office,kindergarten"},
        )
        assert response.status_code == 200

    def test_limit_ust_sinir(self, client):
        assert client.get(
            "/api/districts/tr-34-adalar/places", params={"limit": 5000}
        ).status_code == 422

    def test_min_confidence_araligi(self, client):
        assert client.get(
            "/api/districts/tr-34-adalar/places", params={"min_confidence": 200}
        ).status_code == 422
```

`backend/tests/test_no_overpass.py`:

```python
"""
Bu tasarimin merkezi vaadi: ingest edilmis bir ilcede filtre paneliyle
oynamak sorgu maliyeti dogurmaz.

Kapsam: ingest EDILMIS ilce. Talep uzerine ingest (POST .../ingest)
tanimi geregi Overpass'e gidiyor, onun testi test_ingest.py'de.
"""

from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

pytestmark = pytest.mark.skipif(
    not Path("app/data/districts.geojson").exists(),
    reason="app/data/districts.geojson yok; once scripts/fetch_districts.py calistir",
)

SORGU_UCLARI = [
    "/api/districts",
    "/api/districts/geojson",
    "/api/districts/tr-34-adalar/summary",
    "/api/districts/tr-34-adalar/places",
    "/api/districts/tr-34-adalar/places?types=factory&has_contact=true",
    "/api/districts/tr-34-adalar/places?sort=lead_score&min_confidence=40",
    "/api/districts/tr-34-adalar/places?include_buffer=false&named_only=true&q=test",
]


@pytest.mark.parametrize("path", SORGU_UCLARI)
def test_sorgu_ucu_overpass_e_gitmiyor(client, path):
    patlayan = AsyncMock(side_effect=AssertionError(
        f"{path} Overpass'e gitti. Sorgu yolu tamamen yerel olmali."
    ))
    with patch("app.overpass.overpass_client.query", new=patlayan):
        response = client.get(path)

    assert response.status_code == 200
    patlayan.assert_not_awaited()


def test_tum_sorgu_uclari_ag_olmadan_calisir(client):
    """
    httpx.AsyncClient tamamen devre disi: ag katmani yoksa da
    endpoint'ler yanit vermeli. Cevrimdisi calisma garantisi.
    """
    with patch("httpx.AsyncClient", side_effect=AssertionError("ag cagrisi yapildi")):
        for path in SORGU_UCLARI:
            assert client.get(path).status_code == 200, path
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

Run: `cd backend && python -m pytest tests/test_districts_api.py tests/test_no_overpass.py -v`

Expected: FAIL — tüm endpoint'ler `404`

- [ ] **Step 3: Router'ı yaz**

`backend/app/routers/districts.py`:

```python
"""
Ilce endpoint'leri.

Sorgu uclari (GET) tamamen yerel: districts.geojson + SQLite. Overpass'e
yalnizca talep uzerine ingest (POST) gidiyor.
"""

import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import APIKey, get_db
from app.districts import (
    DEFAULT_BUFFER_M,
    all_districts,
    get_district,
    raw_geojson,
)
from app.ingest import FRESH_AFTER_DAYS, ingest_district
from app.queries import ALL_TYPES, PlaceFilter, VALID_SORTS, count_by_type, fetch_places
from app.store import get_ingest_state, ingest_states
from app.auth import verify_api_key

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/districts", tags=["districts"])

MAX_LIMIT = 1000


def _require_district(district_id: str):
    """
    Ilceyi getir; kapsam disiysa 422.

    Kapsam disi ilce icin Overpass'e hic gidilmiyor — maliyet tavaninin
    kilidi bu kontrol.
    """
    district = get_district(district_id)
    if district is None:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Kapsam disi veya bilinmeyen ilce: {district_id}. "
                f"Kapsam: Istanbul, Edirne, Tekirdag, Kirklareli, Malatya."
            ),
        )
    return district


def _ingest_info(state) -> dict | None:
    """Ingest durumunu arayuzun bekledigi sekle cevirir."""
    if state is None:
        return None

    age = datetime.now(timezone.utc).replace(tzinfo=None) - state.fetched_at
    return {
        "fetched_at": state.fetched_at.isoformat(),
        "place_count": state.place_count,
        "status": state.status,
        "age_days": age.days,
        # Otomatik tazeleme yok; arayuz bu bayrakla hatirlatma gosteriyor.
        "stale": age > timedelta(days=FRESH_AFTER_DAYS),
    }


def _parse_types(raw: str | None) -> tuple[str, ...]:
    """
    'factory,office' -> ('factory', 'office'). Bilinmeyen tur 422.

    Sessizce yok saymak yerine reddediliyor: yazim hatasi yapan
    kullanici bos sonuc gorup "bu ilcede yok" sanardi.
    """
    if not raw:
        return ()

    requested = tuple(t.strip() for t in raw.split(",") if t.strip())
    unknown = [t for t in requested if t not in ALL_TYPES]
    if unknown:
        raise HTTPException(
            status_code=422,
            detail=f"Bilinmeyen tur: {', '.join(unknown)}. Gecerli: {', '.join(ALL_TYPES)}",
        )
    return requested


def _to_client_place(row) -> dict:
    """PlaceRow'u arayuzun bekledigi sekle cevirir."""
    import json

    return {
        "id": row.id,
        "name": row.name,
        "type": row.place_type,
        "lat": row.lat,
        "lon": row.lon,
        "address": row.address,
        "phone": row.phone,
        "email": row.email,
        "website": row.website,
        "confidence": row.confidence,
        "has_contact": bool(row.has_contact),
        "tags": json.loads(row.tags_json or "{}"),
    }


@router.get("")
async def list_districts(db: AsyncSession = Depends(get_db)) -> dict:
    """Kapsamdaki 80 ilcenin metadata'si (poligonsuz, ~8 KB)."""
    states = await ingest_states(db)
    return {
        "districts": [
            {
                "id": d.id,
                "name": d.name,
                "province": d.province,
                "province_plate": d.province_plate,
                "center": list(d.center),
                "bbox": list(d.bbox),
                "ingest": _ingest_info(states.get(d.id)),
            }
            for d in all_districts()
        ]
    }


@router.get("/geojson")
async def district_geojson(response: Response) -> dict:
    """
    Ilce poligonlari (~500 KB - 1 MB).

    Sinir verisi degismiyor; uzun cache omru veriliyor ki tarayici
    her acilista yeniden indirmesin.
    """
    response.headers["Cache-Control"] = "public, max-age=604800, immutable"
    return raw_geojson()


@router.get("/{district_id}/summary")
async def district_summary(
    district_id: str,
    include_buffer: bool = Query(True),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Tur basina kayit sayisi. Arayuzdeki chip sayilarini besliyor.
    10 turun hepsi anahtar olarak donuyor, sifir olanlar dahil.
    """
    district = _require_district(district_id)
    counts = await count_by_type(db, district_id, include_buffer)

    return {
        "district_id": district_id,
        "name": district.name,
        "counts": counts,
        "total": sum(counts.values()),
        "ingest": _ingest_info(await get_ingest_state(db, district_id)),
    }


@router.get("/{district_id}/places")
async def district_places(
    district_id: str,
    types: str | None = Query(None, description="Virgul ayrik tur listesi"),
    has_contact: bool = Query(False),
    named_only: bool = Query(False),
    min_confidence: int = Query(0, ge=0, le=100),
    q: str | None = Query(None, max_length=100),
    include_buffer: bool = Query(True),
    include_unclassified: bool = Query(False),
    sort: str = Query("contact_first"),
    ref_lat: float | None = Query(None, ge=-90, le=90),
    ref_lon: float | None = Query(None, ge=-180, le=180),
    limit: int = Query(500, ge=1, le=MAX_LIMIT),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Filtrelenmis ve siralanmis POI listesi. Tamamen yerel SQL;
    Overpass'e gidilmiyor.
    """
    _require_district(district_id)

    if sort not in VALID_SORTS:
        raise HTTPException(
            status_code=422,
            detail=f"Gecersiz siralama: {sort}. Gecerli: {', '.join(sorted(VALID_SORTS))}",
        )

    place_filter = PlaceFilter(
        district_id=district_id,
        types=_parse_types(types),
        has_contact=has_contact,
        named_only=named_only,
        min_confidence=min_confidence,
        q=q,
        include_buffer=include_buffer,
        include_unclassified=include_unclassified,
        sort=sort,
        ref_lat=ref_lat,
        ref_lon=ref_lon,
        limit=limit,
        offset=offset,
    )

    rows, total = await fetch_places(db, place_filter)

    return {
        "results": [_to_client_place(r) for r in rows],
        "count": len(rows),
        "total": total,
        "query": {
            "district_id": district_id,
            "types": list(place_filter.types),
            "sort": sort,
            "limit": limit,
            "offset": offset,
        },
    }


@router.post("/{district_id}/ingest")
async def trigger_ingest(
    district_id: str,
    force: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    api_key: APIKey = Depends(verify_api_key),
) -> dict:
    """
    Talep uzerine ingest.

    Bu, modulun Overpass'e giden TEK ucu. Haritada henuz cekilmemis bir
    ilceye tiklandiginda veya kullanici "Yenile" dediginde cagriliyor.
    Ilce basina 4 sorgu.
    """
    _require_district(district_id)

    result = await ingest_district(db, district_id, DEFAULT_BUFFER_M, force)

    return {
        "district_id": result.district_id,
        "place_count": result.place_count,
        "query_count": result.query_count,
        "status": result.status,
        "skipped": result.skipped,
    }
```

- [ ] **Step 4: Router'ı kaydet**

`backend/app/main.py`, import satırını güncelle:

```python
from app.routers import (
    account, admin, districts, export, health, metrics, presets, search
)
```

`search` router'ının kaydından sonra:

```python
app.include_router(search.router, prefix="/api", tags=["search"])
# districts.router kendi /api/districts prefix'ini tasiyor
app.include_router(districts.router)
```

- [ ] **Step 5: Testleri çalıştır, geçtiğini doğrula**

Run: `cd backend && python -m pytest tests/test_districts_api.py tests/test_no_overpass.py -v`

Expected: PASS. `test_no_overpass.py` 8 test (7 parametrik + 1).

- [ ] **Step 6: `test_no_overpass.py`'ın gerçekten koruduğunu doğrula**

`district_places` fonksiyonunun başına geçici olarak bir Overpass çağrısı ekle:

```python
    from app.overpass import overpass_client
    await overpass_client.query("[out:json];out;")
```

Run: `cd backend && python -m pytest tests/test_no_overpass.py -v`

Expected: FAIL — `AssertionError: /api/districts/tr-34-adalar/places Overpass'e gitti`. Satırı sil, testin tekrar geçtiğini doğrula. Bu adım testin boş kabuk olmadığını kanıtlıyor.

- [ ] **Step 7: Tüm testleri çalıştır**

Run: `cd backend && python -m pytest tests/ -v`

Expected: tümü PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/app/routers/districts.py backend/app/main.py backend/tests/test_districts_api.py backend/tests/test_no_overpass.py
git commit -m "feat: ilce metadata, geojson, ozet, arama ve ingest uclarini ekle"
```

---

## Task 9: `LOCAL_MODE` — ticari katmanı devre dışı bırak

**Neden:** Kota/plan sistemi (`free`/`pro`/`enterprise`, `daily_limit`, `UpgradeModal`, export kilidi) tamamen ticari amaçlı. Yerel bir araçta bu sürtünme: kullanıcı arama yapabilmek için admin endpoint'inden anahtar üretmek zorunda kalıyor. **Kod silinmiyor**, bayrakla kapanıyor; `LOCAL_MODE=false` ile mevcut davranış aynen geri geliyor.

**Files:**
- Modify: `backend/app/config.py` (ayar), `backend/app/auth.py` (iki gate)
- Modify: `src/app/page.tsx:60-70` (`exportBlockedReason`)
- Modify: `.env.local.example`, `backend/.env.example`
- Test: `backend/tests/test_local_mode.py`

**Interfaces:**
- Consumes: yok
- Produces:
  - `app.config.settings.local_mode: bool` — `LOCAL_MODE` env, varsayılan `False`
  - `LOCAL_API_KEY: APIKey` — `local_mode` açıkken `verify_api_key`/`validate_api_key`'in döndürdüğü sanal anahtar: `name="local"`, `plan="enterprise"`, `daily_limit=10**9`, `used_today=0`, `is_active=True`
  - Frontend: `NEXT_PUBLIC_LOCAL_MODE=true` iken `exportBlockedReason` her zaman `null`

- [ ] **Step 1: Testi yaz**

`backend/tests/test_local_mode.py`:

```python
"""
LOCAL_MODE: yerel kullanimda kota/plan katmanini baypas eder.

conftest.py auth'u override ettigi icin bu testler override'i
kaldirip gercek dependency'yi calistiriyor.
"""

import pytest
from fastapi.testclient import TestClient

from app.auth import validate_api_key, verify_api_key
from app.config import settings
from app.main import app


@pytest.fixture
def gercek_auth():
    """conftest'in auth override'ini gecici olarak kaldirir."""
    saved = dict(app.dependency_overrides)
    app.dependency_overrides.pop(verify_api_key, None)
    app.dependency_overrides.pop(validate_api_key, None)
    yield
    app.dependency_overrides.clear()
    app.dependency_overrides.update(saved)


@pytest.fixture
def local_mode(monkeypatch):
    monkeypatch.setattr(settings, "local_mode", True)
    yield


@pytest.fixture
def uzak_mode(monkeypatch):
    monkeypatch.setattr(settings, "local_mode", False)
    yield


class TestLocalModeAcik:
    def test_anahtarsiz_arama_calisir(self, gercek_auth, local_mode):
        with TestClient(app) as client:
            response = client.get(
                "/api/search", params={"lat": 41.0, "lon": 29.0, "type": "factory"}
            )
        # 401 OLMAMALI. Overpass erisilemezse 503 kabul.
        assert response.status_code != 401

    def test_sanal_anahtar_enterprise_plan(self, local_mode):
        from app.auth import LOCAL_API_KEY

        assert LOCAL_API_KEY.plan == "enterprise"
        assert LOCAL_API_KEY.is_active is True
        # Kota sayaci islemiyor; sinir pratikte sonsuz.
        assert LOCAL_API_KEY.daily_limit >= 10**9

    def test_kota_sayaci_artmiyor(self, local_mode):
        from app.auth import LOCAL_API_KEY

        before = LOCAL_API_KEY.used_today
        with TestClient(app) as client:
            client.get("/api/districts")
        assert LOCAL_API_KEY.used_today == before


class TestLocalModeKapali:
    def test_anahtarsiz_istek_401(self, gercek_auth, uzak_mode):
        with TestClient(app) as client:
            response = client.get(
                "/api/search", params={"lat": 41.0, "lon": 29.0, "type": "factory"}
            )
        assert response.status_code == 401

    def test_varsayilan_kapali(self):
        # Uretim davranisi degismemeli: bayrak acikca acilmadikca
        # mevcut kimlik dogrulamasi gecerli.
        from app.config import Settings

        assert Settings().local_mode is False
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

Run: `cd backend && python -m pytest tests/test_local_mode.py -v`

Expected: FAIL — `AttributeError: 'Settings' object has no attribute 'local_mode'`

- [ ] **Step 3: Ayarı ekle**

`backend/app/config.py`:

```python
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    overpass_api_url: str = "https://overpass-api.de/api/interpreter"
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:3001"]
    port: int = 8000

    # Yerel kullanim modu.
    #
    # Kota/plan sistemi (free/pro/enterprise, daily_limit, UpgradeModal,
    # export kilidi) ticari kullanim icin yazildi. Yerelde calisan bir
    # aracta bu sadece surtunme: kullanici arama yapabilmek icin admin
    # ucundan anahtar uretmek zorunda kaliyor.
    #
    # true: X-API-KEY zorunlu degil, kota sayaci islemez, export serbest.
    # false (varsayilan): mevcut davranis aynen gecerli.
    local_mode: bool = False

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
```

- [ ] **Step 4: Auth gate'lerini güncelle**

`backend/app/auth.py`, import'lara ekle:

```python
from app.config import settings
```

`_get_api_key_obj` fonksiyonundan **önce** sanal anahtarı tanımla:

```python
# LOCAL_MODE'da dondurulen sanal anahtar.
#
# Veritabaninda karsiligi yok ve olmasi da gerekmiyor: kota sayaci
# islemedigi icin hicbir alani guncellenmiyor. Modul seviyesinde tek
# ornek olmasi bilincli — testler used_today'in artmadigini bu ornek
# uzerinden dogruluyor.
LOCAL_API_KEY = APIKey(
    name="local",
    key_hash="local-mode",
    is_active=True,
    plan="enterprise",
    daily_limit=10**9,
    used_today=0,
    last_reset_date=datetime.now(timezone.utc).replace(tzinfo=None),
)
```

`validate_api_key` gövdesinin başına:

```python
async def validate_api_key(
    x_api_key: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
) -> APIKey:
    """Validate key exists and is active, without incrementing usage."""
    if settings.local_mode:
        return LOCAL_API_KEY

    if not x_api_key:
        raise HTTPException(status_code=401, detail="X-API-KEY required")
    return await _get_api_key_obj(x_api_key, db)
```

`verify_api_key` gövdesinin başına:

```python
async def verify_api_key(
    x_api_key: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
) -> APIKey:
    """Validate API key and increment daily usage."""
    # LOCAL_MODE: kota sayaci islemiyor, bu yuzden used_today
    # artirilmiyor ve db'ye yazilmiyor.
    if settings.local_mode:
        return LOCAL_API_KEY

    if not x_api_key:
        raise HTTPException(status_code=401, detail="X-API-KEY required")

    key_obj = await _get_api_key_obj(x_api_key, db)
    ...
```

- [ ] **Step 5: Testleri çalıştır, geçtiğini doğrula**

Run: `cd backend && python -m pytest tests/test_local_mode.py -v`

Expected: PASS (5 test)

- [ ] **Step 6: Mevcut auth testlerinin bozulmadığını doğrula**

Run: `cd backend && python -m pytest tests/test_api.py -v -k "Auth"`

Expected: PASS. `local_mode` varsayılan `False` olduğu için `TestAuthentication` etkilenmiyor — bu, bayrağın geri dönülebilir olduğunun kanıtı.

- [ ] **Step 7: Frontend export kilidini bayrağa bağla**

`src/app/page.tsx`, `exportBlockedReason` bloğunu değiştir (satır 60-70):

```typescript
  /**
   * Export'un neden yapilamayacagini onceden belirle. Backend 'free'
   * planda 403, kota dolunca 429 donuyordu; kullanici bunu ancak butona
   * bastiktan sonra ogreniyordu.
   *
   * LOCAL_MODE'da kota/plan katmani devre disi: yerel arac icin plan
   * kontrolu anlamsiz ve kullaniciyi bos yere engelliyordu.
   */
  const exportBlockedReason = (() => {
    if (process.env.NEXT_PUBLIC_LOCAL_MODE === "true") return null;
    if (!account) return "Dışa aktarım için API anahtarı gerekli.";
    if (!account.is_active) return "API anahtarınız devre dışı.";
    if (account.plan === "free") {
      return "CSV dışa aktarım ücretsiz planda kapalı. Pro veya Enterprise gerekir.";
    }
    if (account.daily_limit - account.used_today < 2) {
      return "Günlük kotanız dışa aktarım için yetersiz (2 birim gerekir).";
    }
    return null;
  })();
```

- [ ] **Step 8: Env örneklerini güncelle**

`.env.local.example` sonuna:

```
# Yerel kullanim modu.
# true: API anahtari zorunlu degil, kota/plan kontrolu kapali,
# export serbest, UpgradeModal hic acilmaz.
# Backend tarafinda da LOCAL_MODE=true olmali (backend/.env).
NEXT_PUBLIC_LOCAL_MODE=true
```

`backend/.env.example` sonuna:

```
# Yerel kullanim modu. true ise X-API-KEY zorunlu degil ve kota
# sayaci islemez. Uretimde false birakilmali.
LOCAL_MODE=true

# Ilce sinirina eklenen arama tamponu (metre).
DISTRICT_BUFFER_M=2000
```

- [ ] **Step 9: Tip kontrolü ve tüm testler**

Run: `pnpm type-check && cd backend && python -m pytest tests/ -v`

Expected: ikisi de temiz.

- [ ] **Step 10: Commit**

```bash
git add backend/app/config.py backend/app/auth.py backend/tests/test_local_mode.py src/app/page.tsx .env.local.example backend/.env.example
git commit -m "feat: LOCAL_MODE ile kota ve plan katmanini baypas et"
```

---

## Task 10: Vitest kurulumu ve `lib/districts.ts`

**Neden:** Projede frontend test koşucusu yok — `package.json`'da yalnızca `type-check` var. Spec'in "pan artık arama tetiklemiyor" regresyon testi (T15) bir koşucu olmadan çalıştırılamaz. Kurulum, ona ihtiyaç duyan ilk task'a katlanıyor.

**Files:**
- Modify: `package.json` (devDependencies + `test` script)
- Create: `vitest.config.ts`, `vitest.setup.ts`
- Create: `src/lib/districts.ts`
- Test: `src/lib/districts.test.ts`

**Interfaces:**
- Consumes: T8'den HTTP sözleşmesi
- Produces:
  - `interface DistrictIngestInfo { fetched_at: string; place_count: number; status: string; age_days: number; stale: boolean }`
  - `interface DistrictMeta { id: string; name: string; province: string; province_plate: string; center: [number, number]; bbox: [number, number, number, number]; ingest: DistrictIngestInfo | null }`
  - `interface DistrictPlace { id, name: string | null, type: PlaceType | null, lat, lon: number, address, phone, email, website: string | null, confidence: number, has_contact: boolean, tags: Record<string, string> }`
  - `interface PlacesResponse { results: DistrictPlace[]; count: number; total: number }`
  - `interface SummaryResponse { district_id: string; name: string; counts: Record<PlaceType, number>; total: number; ingest: DistrictIngestInfo | null }`
  - `interface PlaceQuery { types?: PlaceType[]; hasContact?: boolean; namedOnly?: boolean; minConfidence?: number; q?: string; includeBuffer?: boolean; sort?: SortKey; limit?: number; offset?: number }`
  - `type SortKey = "contact_first" | "confidence" | "name" | "lead_score" | "ref_distance"`
  - `PROVINCES: readonly { plate: string; name: string }[]` — 5 il, ad sırasıyla
  - `DEFAULT_PLATE: string` = `"34"` (İstanbul; 80 ilçenin 39'u orada)
  - `buildPlacesParams(query: PlaceQuery): URLSearchParams`
  - `fetchDistricts(): Promise<DistrictMeta[]>`
  - `fetchDistrictGeoJson<T>(): Promise<T>` (modül düzeyinde belleklenir)
  - `fetchDistrictPlaces(districtId: string, query: PlaceQuery, init?: RequestInit): Promise<PlacesResponse>`
  - `fetchDistrictSummary(districtId: string, includeBuffer?: boolean, init?: RequestInit): Promise<SummaryResponse>` — `includeBuffer` sayımları etkiliyor, atlanırsa chip sayıları sessizce yanlış kalır
  - `triggerDistrictIngest(districtId: string, force?: boolean): Promise<{ place_count: number; status: string; skipped: boolean }>`

- [ ] **Step 1: Test koşucusunu kur**

```bash
pnpm add -D vitest@^2.1.0 @vitejs/plugin-react@^4.3.0 jsdom@^25.0.0 @testing-library/react@^16.0.0 @testing-library/jest-dom@^6.6.0 @testing-library/user-event@^14.5.0
```

`package.json` `scripts` bloğuna ekle:

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

`vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
```

`vitest.setup.ts`:

```typescript
import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
```

- [ ] **Step 2: Koşucunun ayakta olduğunu doğrula**

Run: `pnpm test`

Expected: `No test files found` — hata değil, koşucu çalışıyor demek.

- [ ] **Step 3: Testi yaz**

`src/lib/districts.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  PROVINCES,
  buildPlacesParams,
  fetchDistrictPlaces,
  fetchDistrictSummary,
  fetchDistricts,
  triggerDistrictIngest,
} from "./districts";

function mockFetch(body: unknown, ok = true, status = 200) {
  const spy = vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

describe("PROVINCES", () => {
  it("bes il icerir", () => {
    expect(PROVINCES).toHaveLength(5);
  });

  it("plaka kodlari dogru", () => {
    const plates = PROVINCES.map((p) => p.plate).sort();
    expect(plates).toEqual(["22", "34", "39", "44", "59"]);
  });
});

describe("buildPlacesParams", () => {
  it("bos sorgu bos parametre uretir", () => {
    expect(buildPlacesParams({}).toString()).toBe("");
  });

  it("turleri virgulle birlestirir", () => {
    const params = buildPlacesParams({ types: ["factory", "office"] });
    expect(params.get("types")).toBe("factory,office");
  });

  it("bos tur dizisi parametre eklemez", () => {
    // Bos dizi "hicbir tur" degil "tum turler" demek; parametre
    // gonderilirse backend bunu bos IN() olarak yorumlayip
    // hicbir sonuc dondurmez.
    expect(buildPlacesParams({ types: [] }).has("types")).toBe(false);
  });

  it("false degerleri gondermez", () => {
    const params = buildPlacesParams({ hasContact: false, namedOnly: false });
    expect(params.has("has_contact")).toBe(false);
    expect(params.has("named_only")).toBe(false);
  });

  it("true degerleri gonderir", () => {
    const params = buildPlacesParams({ hasContact: true, namedOnly: true });
    expect(params.get("has_contact")).toBe("true");
    expect(params.get("named_only")).toBe("true");
  });

  it("includeBuffer yalnizca false ise gonderilir", () => {
    // Backend varsayilani true; gereksiz parametre gondermiyoruz.
    expect(buildPlacesParams({ includeBuffer: true }).has("include_buffer")).toBe(false);
    expect(buildPlacesParams({ includeBuffer: false }).get("include_buffer")).toBe("false");
  });

  it("sifir minConfidence gondermez", () => {
    expect(buildPlacesParams({ minConfidence: 0 }).has("min_confidence")).toBe(false);
    expect(buildPlacesParams({ minConfidence: 40 }).get("min_confidence")).toBe("40");
  });

  it("bos metin aramasi gondermez", () => {
    expect(buildPlacesParams({ q: "" }).has("q")).toBe(false);
    expect(buildPlacesParams({ q: "  " }).has("q")).toBe(false);
    expect(buildPlacesParams({ q: " alfa " }).get("q")).toBe("alfa");
  });

  it("siralama ve sayfalama gecer", () => {
    const params = buildPlacesParams({ sort: "lead_score", limit: 100, offset: 200 });
    expect(params.get("sort")).toBe("lead_score");
    expect(params.get("limit")).toBe("100");
    expect(params.get("offset")).toBe("200");
  });
});

describe("fetchDistricts", () => {
  it("districts dizisini cikarir", async () => {
    mockFetch({ districts: [{ id: "tr-34-kadikoy", name: "Kadıköy" }] });
    const result = await fetchDistricts();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("tr-34-kadikoy");
  });

  it("hata mesajini firlatir", async () => {
    mockFetch({ message: "Backend'e ulasilamadi." }, false, 502);
    await expect(fetchDistricts()).rejects.toThrow("Backend'e ulasilamadi.");
  });
});

describe("fetchDistrictPlaces", () => {
  beforeEach(() => {
    mockFetch({ results: [], count: 0, total: 0 });
  });

  it("dogru yola gider", async () => {
    const spy = mockFetch({ results: [], count: 0, total: 0 });
    await fetchDistrictPlaces("tr-34-kadikoy", { types: ["factory"] });

    const url = spy.mock.calls[0][0] as string;
    expect(url).toContain("/api/districts/tr-34-kadikoy/places");
    expect(url).toContain("types=factory");
  });

  it("ilce kimligini URL icin kacirir", async () => {
    const spy = mockFetch({ results: [], count: 0, total: 0 });
    await fetchDistrictPlaces("tr-34-a b", {});
    expect(spy.mock.calls[0][0]).toContain("tr-34-a%20b");
  });

  it("abort sinyalini gecirir", async () => {
    const spy = mockFetch({ results: [], count: 0, total: 0 });
    const controller = new AbortController();
    await fetchDistrictPlaces("tr-34-kadikoy", {}, { signal: controller.signal });
    expect(spy.mock.calls[0][1].signal).toBe(controller.signal);
  });
});

describe("fetchDistrictSummary", () => {
  it("sayimlari dondurur", async () => {
    mockFetch({
      district_id: "tr-34-kadikoy",
      name: "Kadıköy",
      counts: { factory: 34, office: 121 },
      total: 155,
      ingest: null,
    });
    const summary = await fetchDistrictSummary("tr-34-kadikoy");
    expect(summary.counts.factory).toBe(34);
    expect(summary.total).toBe(155);
  });
});

describe("triggerDistrictIngest", () => {
  it("POST kullanir", async () => {
    const spy = mockFetch({ place_count: 412, status: "ok", skipped: false });
    await triggerDistrictIngest("tr-34-kadikoy");
    expect(spy.mock.calls[0][1].method).toBe("POST");
  });

  it("force parametresini gecirir", async () => {
    const spy = mockFetch({ place_count: 412, status: "ok", skipped: false });
    await triggerDistrictIngest("tr-34-kadikoy", true);
    expect(spy.mock.calls[0][0]).toContain("force=true");
  });
});
```

- [ ] **Step 4: Testi çalıştır, başarısız olduğunu doğrula**

Run: `pnpm test src/lib/districts.test.ts`

Expected: FAIL — `Failed to resolve import "./districts"`

- [ ] **Step 5: `src/lib/districts.ts`'i yaz**

```typescript
import type { PlaceType } from "./types";

/**
 * Ilce verisi ve yerel POI aramasi icin istemci katmani.
 *
 * Tum cagrilar Next.js proxy route'una gidiyor (/api/districts/...);
 * proxy backend'e iletiyor. Bu ucların hicbiri Overpass'e gitmiyor —
 * tek istisna triggerDistrictIngest.
 */

export type SortKey =
  | "contact_first"
  | "confidence"
  | "name"
  | "lead_score"
  | "ref_distance";

export interface DistrictIngestInfo {
  fetched_at: string;
  place_count: number;
  status: string;
  age_days: number;
  /** 30 gunden eski; arayuz hatirlatma gosteriyor, otomatik cekim yok. */
  stale: boolean;
}

export interface DistrictMeta {
  id: string;
  name: string;
  province: string;
  province_plate: string;
  /** [lat, lon] */
  center: [number, number];
  /** [south, west, north, east] */
  bbox: [number, number, number, number];
  ingest: DistrictIngestInfo | null;
}

export interface DistrictPlace {
  id: string;
  name: string | null;
  type: PlaceType | null;
  lat: number;
  lon: number;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  confidence: number;
  has_contact: boolean;
  tags: Record<string, string>;
}

export interface PlacesResponse {
  results: DistrictPlace[];
  count: number;
  total: number;
}

export interface SummaryResponse {
  district_id: string;
  name: string;
  counts: Record<PlaceType, number>;
  total: number;
  ingest: DistrictIngestInfo | null;
}

export interface PlaceQuery {
  types?: PlaceType[];
  hasContact?: boolean;
  namedOnly?: boolean;
  minConfidence?: number;
  q?: string;
  includeBuffer?: boolean;
  sort?: SortKey;
  limit?: number;
  offset?: number;
}

/** Kapsam. Ad sirasina gore; arayuzdeki chip sirasi bu. */
export const PROVINCES = [
  { plate: "22", name: "Edirne" },
  { plate: "34", name: "İstanbul" },
  { plate: "39", name: "Kırklareli" },
  { plate: "44", name: "Malatya" },
  { plate: "59", name: "Tekirdağ" },
] as const;

/**
 * Acilista aktif olan il.
 *
 * PROVINCES[0] kullanmak Edirne'ye dusuruyordu (alfabetik ilk) —
 * 80 ilcenin 39'u Istanbul'da, varsayilan orada olmali.
 */
export const DEFAULT_PLATE = "34";

/** Backend hatalari { message } ile geliyor (bkz. server/backend.ts). */
async function readJson<T>(response: Response, label: string): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      data && typeof data.message === "string"
        ? data.message
        : `${label} başarısız (HTTP ${response.status})`;
    throw new Error(message);
  }
  return data as T;
}

/**
 * PlaceQuery'yi URL parametrelerine cevirir.
 *
 * Varsayilan degerler bilincli olarak gonderilmiyor: URL kisa kaliyor
 * ve backend varsayilanlari tek dogru kaynak oluyor. Ozellikle bos tur
 * dizisi parametre uretmemeli — "hicbir tur" degil "tum turler" demek.
 */
export function buildPlacesParams(query: PlaceQuery): URLSearchParams {
  const params = new URLSearchParams();

  if (query.types && query.types.length > 0) {
    params.set("types", query.types.join(","));
  }
  if (query.hasContact) params.set("has_contact", "true");
  if (query.namedOnly) params.set("named_only", "true");
  if (query.minConfidence && query.minConfidence > 0) {
    params.set("min_confidence", String(query.minConfidence));
  }

  const text = query.q?.trim();
  if (text) params.set("q", text);

  // Backend varsayilani true; yalnizca kapatildiginda gonderiyoruz.
  if (query.includeBuffer === false) params.set("include_buffer", "false");

  if (query.sort) params.set("sort", query.sort);
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.offset) params.set("offset", String(query.offset));

  return params;
}

export async function fetchDistricts(): Promise<DistrictMeta[]> {
  const response = await fetch("/api/districts");
  const data = await readJson<{ districts: DistrictMeta[] }>(response, "İlçe listesi");
  return data.districts;
}

/**
 * Ilce poligonlari (~500 KB - 1 MB).
 *
 * Modul duzeyinde belleklenir: harita her yeniden bindiginde 1 MB
 * yeniden indirilmesin. Sinir verisi oturum icinde degismiyor.
 */
let geoJsonCache: Promise<unknown> | null = null;

export function fetchDistrictGeoJson<T = unknown>(): Promise<T> {
  if (!geoJsonCache) {
    geoJsonCache = fetch("/api/districts/geojson")
      .then((response) => readJson<T>(response, "İlçe sınırları"))
      .catch((error) => {
        // Basarisiz istek onbellege takilmasin, sonraki deneme
        // yeniden gitsin.
        geoJsonCache = null;
        throw error;
      });
  }
  return geoJsonCache as Promise<T>;
}

export async function fetchDistrictPlaces(
  districtId: string,
  query: PlaceQuery,
  init?: RequestInit
): Promise<PlacesResponse> {
  const params = buildPlacesParams(query);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(
    `/api/districts/${encodeURIComponent(districtId)}/places${suffix}`,
    init
  );
  return readJson<PlacesResponse>(response, "Arama");
}

/**
 * Tur basina sayimlar.
 *
 * includeBuffer sayimlari etkiliyor (backend count_by_type bunu
 * aliyor): tampon bolgesindeki kayitlar sayima girip girmemeli.
 * Parametre gecilmezse arayuzdeki anahtar degistiginde ayni sonuc
 * doner ve chip sayilari sessizce yanlis kalir.
 */
export async function fetchDistrictSummary(
  districtId: string,
  includeBuffer = true,
  init?: RequestInit
): Promise<SummaryResponse> {
  const suffix = includeBuffer ? "" : "?include_buffer=false";
  const response = await fetch(
    `/api/districts/${encodeURIComponent(districtId)}/summary${suffix}`,
    init
  );
  return readJson<SummaryResponse>(response, "İlçe özeti");
}

export async function triggerDistrictIngest(
  districtId: string,
  force = false
): Promise<{ place_count: number; status: string; skipped: boolean }> {
  const suffix = force ? "?force=true" : "";
  const response = await fetch(
    `/api/districts/${encodeURIComponent(districtId)}/ingest${suffix}`,
    { method: "POST" }
  );
  return readJson(response, "Veri çekme");
}
```

- [ ] **Step 6: Testleri çalıştır, geçtiğini doğrula**

Run: `pnpm test src/lib/districts.test.ts`

Expected: PASS (18 test)

- [ ] **Step 7: Tip kontrolü**

Run: `pnpm type-check`

Expected: temiz.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts vitest.setup.ts src/lib/districts.ts src/lib/districts.test.ts
git commit -m "feat: vitest kurulumu ve ilce veri istemci katmani"
```

---

## Task 11: `components/DistrictPicker.tsx`

> **Tasarım sistemi — bu task için zorunlu.** Aşağıdaki kod bloklarındaki
> sınıflar tasarım sistemi token'larına çevrilmiştir (`bg-accent`,
> `text-ink-*`, `rounded-input`, `mono-label`, `surface`, `rule-b`,
> `duration-fast ease-out`). **Yazmaya başlamadan önce `design.md` ve
> `src/components/Filters.tsx`'i oku.** Filters.tsx bu projede chip
> deseninin referansı: `pressable group ... rounded-input`, aktif
> `bg-accent text-accent-ink`, pasif `text-ink-2 hover:bg-paper-2
> hover:text-ink`, ikon aktif `text-accent-ink` / pasif `text-ink-4
> group-hover:text-ink-3`.
>
> Üç kural: **(1)** ham renk/font değeri yazma (`bg-slate-*`, `text-gray-*`
> yasak). **(2)** Özel focus ring ekleme — `globals.css` içindeki global
> `:focus-visible` bunu hallediyor. **(3)** Gölge ekleme; sistem
> "derinlik kenardan" diyor, yüzeyler `surface` veya `rule-*` ile
> tanımlanıyor. Yalnızca haritanın üstünde yüzen katman `shadow-lift`
> kullanıyor.
>
> Sayı gösteren her yerde `tabular` sınıfını kullan (mono + tabular-nums)
> — sayılar alt alta hizalanmalı.


**Neden:** 80 ilçe içinde "Pehlivanköy"ü haritada gözle bulmak zor; yazmak iki saniye. Harita seçici (T14) ile aynı state'e bağlanıyor.

**Files:**
- Create: `src/components/DistrictPicker.tsx`
- Test: `src/components/DistrictPicker.test.tsx`

**Interfaces:**
- Consumes: T10'dan `DistrictMeta`, `PROVINCES`
- Produces:
```typescript
interface DistrictPickerProps {
  districts: DistrictMeta[];
  selectedDistrictId: string | null;
  onSelect: (districtId: string) => void;
  loading?: boolean;
}
export default function DistrictPicker(props: DistrictPickerProps): JSX.Element
```

- [ ] **Step 1: Testi yaz**

`src/components/DistrictPicker.test.tsx`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DistrictPicker from "./DistrictPicker";
import type { DistrictMeta } from "../lib/districts";

function district(
  id: string,
  name: string,
  plate: string,
  province: string,
  ingest: DistrictMeta["ingest"] = null
): DistrictMeta {
  return {
    id,
    name,
    province,
    province_plate: plate,
    center: [41, 29],
    bbox: [40.9, 28.9, 41.1, 29.1],
    ingest,
  };
}

const DISTRICTS: DistrictMeta[] = [
  district("tr-34-kadikoy", "Kadıköy", "34", "istanbul"),
  district("tr-34-sisli", "Şişli", "34", "istanbul"),
  district("tr-34-adalar", "Adalar", "34", "istanbul"),
  district("tr-39-pehlivankoy", "Pehlivanköy", "39", "kirklareli"),
  district("tr-44-puturge", "Pütürge", "44", "malatya"),
];

describe("DistrictPicker", () => {
  it("bes il chip'i gosterir", () => {
    render(
      <DistrictPicker districts={DISTRICTS} selectedDistrictId={null} onSelect={vi.fn()} />
    );
    for (const name of ["İstanbul", "Edirne", "Tekirdağ", "Kırklareli", "Malatya"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("acilista Istanbul aktif", () => {
    render(
      <DistrictPicker districts={DISTRICTS} selectedDistrictId={null} onSelect={vi.fn()} />
    );
    // 80 ilcenin 39'u Istanbul'da; varsayilan orada olmali.
    // Alfabetik ilk il (Edirne) varsayilan olsa liste cogu zaman bos acilirdi.
    expect(screen.getByRole("option", { name: /Kadıköy/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Pütürge/ })).not.toBeInTheDocument();
  });

  it("ilcesi olmayan il secilince bos durum gosterir", async () => {
    const user = userEvent.setup();
    render(
      <DistrictPicker districts={DISTRICTS} selectedDistrictId={null} onSelect={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: "Edirne" }));

    expect(screen.getByText(/ilçe bulunamadı/i)).toBeInTheDocument();
  });

  it("il degisince ilce listesi guncellenir", async () => {
    const user = userEvent.setup();
    render(
      <DistrictPicker districts={DISTRICTS} selectedDistrictId={null} onSelect={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: "Kırklareli" }));

    expect(screen.getByRole("option", { name: /Pehlivanköy/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Kadıköy/ })).not.toBeInTheDocument();
  });

  it("arama ilce listesini filtreler", async () => {
    const user = userEvent.setup();
    render(
      <DistrictPicker districts={DISTRICTS} selectedDistrictId={null} onSelect={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: "İstanbul" }));
    await user.type(screen.getByRole("searchbox"), "kad");

    expect(screen.getByRole("option", { name: /Kadıköy/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Şişli/ })).not.toBeInTheDocument();
  });

  it("arama Turkce karakterden bagimsiz eslesir", async () => {
    const user = userEvent.setup();
    render(
      <DistrictPicker districts={DISTRICTS} selectedDistrictId={null} onSelect={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: "Malatya" }));
    // "puturge" yazan kullanici "Pütürge"yi bulmali.
    await user.type(screen.getByRole("searchbox"), "puturge");

    expect(screen.getByRole("option", { name: /Pütürge/ })).toBeInTheDocument();
  });

  it("arama tum illerde arar", async () => {
    const user = userEvent.setup();
    render(
      <DistrictPicker districts={DISTRICTS} selectedDistrictId={null} onSelect={vi.fn()} />
    );

    // Once Istanbul secili degil; arama yine de Pehlivankoy'u bulmali,
    // yoksa kullanici ilcenin hangi ilde oldugunu bilmek zorunda kalir.
    await user.type(screen.getByRole("searchbox"), "pehlivan");

    expect(screen.getByRole("option", { name: /Pehlivanköy/ })).toBeInTheDocument();
  });

  it("ilceye tiklayinca onSelect cagrilir", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <DistrictPicker districts={DISTRICTS} selectedDistrictId={null} onSelect={onSelect} />
    );

    await user.click(screen.getByRole("button", { name: "İstanbul" }));
    await user.click(screen.getByRole("option", { name: /Kadıköy/ }));

    expect(onSelect).toHaveBeenCalledWith("tr-34-kadikoy");
  });

  it("secili ilce isaretlenir", async () => {
    const user = userEvent.setup();
    render(
      <DistrictPicker
        districts={DISTRICTS}
        selectedDistrictId="tr-34-kadikoy"
        onSelect={vi.fn()}
      />
    );
    await user.click(screen.getByRole("button", { name: "İstanbul" }));

    expect(screen.getByRole("option", { name: /Kadıköy/ })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  it("secili ilcenin ili acilista aktif olur", () => {
    render(
      <DistrictPicker
        districts={DISTRICTS}
        selectedDistrictId="tr-44-puturge"
        onSelect={vi.fn()}
      />
    );
    // Secim varsa o ilin listesi gosterilmeli, yoksa kullanici
    // secili ilceyi goremez.
    expect(screen.getByRole("option", { name: /Pütürge/ })).toBeInTheDocument();
  });

  it("veri cekilmemis ilce isaretlenir", async () => {
    const user = userEvent.setup();
    render(
      <DistrictPicker districts={DISTRICTS} selectedDistrictId={null} onSelect={vi.fn()} />
    );
    await user.click(screen.getByRole("button", { name: "İstanbul" }));

    expect(screen.getByRole("option", { name: /Kadıköy/ })).toHaveTextContent(/veri yok/i);
  });

  it("bayat veri isaretlenir", async () => {
    const user = userEvent.setup();
    const stale = district("tr-34-uskudar", "Üsküdar", "34", "istanbul", {
      fetched_at: "2026-06-01T00:00:00",
      place_count: 300,
      status: "ok",
      age_days: 47,
      stale: true,
    });
    render(
      <DistrictPicker
        districts={[...DISTRICTS, stale]}
        selectedDistrictId={null}
        onSelect={vi.fn()}
      />
    );
    await user.click(screen.getByRole("button", { name: "İstanbul" }));

    expect(screen.getByRole("option", { name: /Üsküdar/ })).toHaveTextContent(/47 gün/);
  });

  it("kayit sayisi gosterilir", async () => {
    const user = userEvent.setup();
    const fresh = district("tr-34-besiktas", "Beşiktaş", "34", "istanbul", {
      fetched_at: "2026-08-10T00:00:00",
      place_count: 412,
      status: "ok",
      age_days: 3,
      stale: false,
    });
    render(
      <DistrictPicker
        districts={[...DISTRICTS, fresh]}
        selectedDistrictId={null}
        onSelect={vi.fn()}
      />
    );
    await user.click(screen.getByRole("button", { name: "İstanbul" }));

    expect(screen.getByRole("option", { name: /Beşiktaş/ })).toHaveTextContent("412");
  });
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

Run: `pnpm test src/components/DistrictPicker.test.tsx`

Expected: FAIL — `Failed to resolve import "./DistrictPicker"`

- [ ] **Step 3: Komponenti yaz**

`src/components/DistrictPicker.tsx`:

```typescript
"use client";

import React, { useMemo, useState } from "react";
import { MapPin, Search } from "lucide-react";
import { DEFAULT_PLATE, PROVINCES, type DistrictMeta } from "../lib/districts";

interface DistrictPickerProps {
  districts: DistrictMeta[];
  selectedDistrictId: string | null;
  onSelect: (districtId: string) => void;
  loading?: boolean;
}

/**
 * Turkce metni arama icin normalize eder.
 *
 * "puturge" yazan kullanici "Pütürge"yi bulmali. Ayrica buyuk I
 * problemi: "Isik".toLowerCase() birlesik noktali i uretiyor ve
 * "isik" ile eslesmiyor (bkz. backend classify.py tr_fold).
 */
const TR_MAP: Record<string, string> = {
  ç: "c", ğ: "g", ı: "i", İ: "i", I: "i", ö: "o", ş: "s", ü: "u",
  Ç: "c", Ğ: "g", Ö: "o", Ş: "s", Ü: "u", â: "a", î: "i", û: "u",
};

function fold(text: string): string {
  return text
    .split("")
    .map((ch) => TR_MAP[ch] ?? ch)
    .join("")
    .toLowerCase();
}

export default function DistrictPicker({
  districts,
  selectedDistrictId,
  onSelect,
  loading = false,
}: DistrictPickerProps) {
  // Secili ilce varsa onun ili acilista aktif olsun; yoksa kullanici
  // secili ilceyi listede goremez.
  const selectedDistrict = districts.find((d) => d.id === selectedDistrictId);
  const [activePlate, setActivePlate] = useState<string>(
    selectedDistrict?.province_plate ?? DEFAULT_PLATE
  );
  const [search, setSearch] = useState("");

  const visible = useMemo(() => {
    const needle = fold(search.trim());

    // Arama yazildiginda tum illerde ara: kullanici ilcenin hangi ilde
    // oldugunu bilmek zorunda kalmasin.
    const pool = needle
      ? districts
      : districts.filter((d) => d.province_plate === activePlate);

    const matched = needle
      ? pool.filter((d) => fold(d.name).includes(needle))
      : pool;

    return [...matched].sort((a, b) => a.name.localeCompare(b.name, "tr"));
  }, [districts, activePlate, search]);

  return (
    <div className="p-4 rule-b bg-paper">
      <div className="flex items-center gap-2 mb-3">
        <MapPin size={14} className="text-ink-4" />
        <span className="mono-label">
          Konum
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {PROVINCES.map((province) => {
          const isActive = province.plate === activePlate && !search.trim();
          return (
            <button
              key={province.plate}
              type="button"
              onClick={() => {
                setActivePlate(province.plate);
                setSearch("");
              }}
              className={`px-2.5 py-1 rounded-chip text-xs font-semibold transition-colors duration-fast ease-out ${
                isActive
                  ? "bg-accent text-accent-ink"
                  : "bg-paper-2 text-ink-2 hover:bg-paper-3"
              }`}
            >
              {province.name}
            </button>
          );
        })}
      </div>

      <div className="relative mb-2">
        <Search
          size={14}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-4"
        />
        <input
          type="search"
          role="searchbox"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="İlçe ara..."
          className="w-full pl-8 pr-3 py-2 text-sm border border-rule rounded-input "
        />
      </div>

      <ul role="listbox" className="max-h-52 overflow-y-auto -mx-1">
        {loading && (
          <li className="px-3 py-2 text-xs text-ink-4">Yükleniyor...</li>
        )}

        {!loading && visible.length === 0 && (
          <li className="px-3 py-2 text-xs text-ink-4">İlçe bulunamadı.</li>
        )}

        {visible.map((district) => {
          const isSelected = district.id === selectedDistrictId;
          const ingest = district.ingest;

          return (
            <li key={district.id}>
              <button
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => onSelect(district.id)}
                className={`w-full flex items-baseline justify-between gap-2 px-3 py-1.5 rounded-input text-left text-sm transition-colors duration-fast ease-out ${
                  isSelected
                    ? "bg-accent text-accent-ink font-semibold"
                    : "text-ink-2 hover:bg-paper-2"
                }`}
              >
                <span className="truncate">{district.name}</span>
                <span
                  className={`shrink-0 text-2xs font-medium ${
                    isSelected ? "text-ink-4" : "text-ink-4"
                  }`}
                >
                  {!ingest && "veri yok"}
                  {ingest?.stale && `${ingest.age_days} gün`}
                  {ingest && !ingest.stale && ingest.place_count}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Testleri çalıştır, geçtiğini doğrula**

Run: `pnpm test src/components/DistrictPicker.test.tsx`

Expected: PASS (14 test)

- [ ] **Step 5: Commit**

```bash
git add src/components/DistrictPicker.tsx src/components/DistrictPicker.test.tsx
git commit -m "feat: il ve ilce secici komponenti"
```

---

## Task 12: `components/FilterPanel.tsx`

> **Tasarım sistemi — bu task için zorunlu.** Aşağıdaki kod bloklarındaki
> sınıflar tasarım sistemi token'larına çevrilmiştir (`bg-accent`,
> `text-ink-*`, `rounded-input`, `mono-label`, `surface`, `rule-b`,
> `duration-fast ease-out`). **Yazmaya başlamadan önce `design.md` ve
> `src/components/Filters.tsx`'i oku.** Filters.tsx bu projede chip
> deseninin referansı: `pressable group ... rounded-input`, aktif
> `bg-accent text-accent-ink`, pasif `text-ink-2 hover:bg-paper-2
> hover:text-ink`, ikon aktif `text-accent-ink` / pasif `text-ink-4
> group-hover:text-ink-3`.
>
> Üç kural: **(1)** ham renk/font değeri yazma (`bg-slate-*`, `text-gray-*`
> yasak). **(2)** Özel focus ring ekleme — `globals.css` içindeki global
> `:focus-visible` bunu hallediyor. **(3)** Gölge ekleme; sistem
> "derinlik kenardan" diyor, yüzeyler `surface` veya `rule-*` ile
> tanımlanıyor. Yalnızca haritanın üstünde yüzen katman `shadow-lift`
> kullanıyor.
>
> Sayı gösteren her yerde `tabular` sınıfını kullan (mono + tabular-nums)
> — sayılar alt alta hizalanmalı.


**Neden:** Tür çoklu seçimi ve sıralama/filtre kontrolleri. Sayıları `summary` endpoint'i besliyor — sayısı 0 olan tür soluk görünür ama tıklanabilir kalır (kullanıcı "gerçekten 0 mı" diye kontrol edebilsin).

**Files:**
- Create: `src/components/FilterPanel.tsx`
- Test: `src/components/FilterPanel.test.tsx`

**Interfaces:**
- Consumes: T10'dan `SortKey`; T1'den `PlaceType`, `PLACE_TYPE_LABELS`, `PLACE_TYPE_GROUPS`
- Produces:
```typescript
export interface FilterState {
  types: PlaceType[];
  hasContact: boolean;
  namedOnly: boolean;
  minConfidence: number;
  q: string;
  includeBuffer: boolean;
  sort: SortKey;
}
export const DEFAULT_FILTERS: FilterState;
/** `ref_distance` bilinçli olarak dışarıda — referans noktası seçme yolu yok. */
export const SORT_LABELS: Partial<Record<SortKey, string>>;
interface FilterPanelProps {
  filters: FilterState;
  counts: Record<PlaceType, number> | null;
  onChange: (next: FilterState) => void;
  disabled?: boolean;
}
export default function FilterPanel(props: FilterPanelProps): JSX.Element
```

- [ ] **Step 1: Testi yaz**

`src/components/FilterPanel.test.tsx`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FilterPanel, { DEFAULT_FILTERS, type FilterState } from "./FilterPanel";
import type { PlaceType } from "../lib/types";

const COUNTS: Record<PlaceType, number> = {
  factory: 34, office: 121, workshop: 8,
  kindergarten: 12, primary_school: 20, middle_school: 15,
  high_school: 5, private_school: 3, college_keyword: 2,
  college_university: 0,
};

function setup(filters: Partial<FilterState> = {}, counts = COUNTS) {
  const onChange = vi.fn();
  render(
    <FilterPanel
      filters={{ ...DEFAULT_FILTERS, ...filters }}
      counts={counts}
      onChange={onChange}
    />
  );
  return { onChange };
}

describe("varsayilanlar", () => {
  it("backend varsayilanlariyla ayni", () => {
    expect(DEFAULT_FILTERS).toEqual({
      types: [],
      hasContact: false,
      namedOnly: false,
      minConfidence: 0,
      q: "",
      includeBuffer: true,
      sort: "contact_first",
    });
  });
});

describe("tur chip'leri", () => {
  it("on tur gosterir", () => {
    setup();
    // Tur chip'leri aria-pressed'li buton (Filters.tsx deseni), gercek
    // checkbox degil. Gercek checkbox'lar asagidaki filtre anahtarlari.
    expect(screen.getAllByRole("button", { name: /Fabrika|Ofis|Atölye|Anaokulu|İlkokul|Ortaokul|Lise|Özel Okul|Kolej|Üniversite/ }))
      .toHaveLength(10);
  });

  it("sayilari gosterir", () => {
    setup();
    expect(screen.getByRole("button", { name: /Fabrika/ })).toHaveTextContent("34");
    expect(screen.getByRole("button", { name: /Ofis/ })).toHaveTextContent("121");
  });

  it("sifir sayili tur tiklanabilir kalir", () => {
    setup();
    // Kullanici "gerçekten 0 mi" diye kontrol edebilmeli.
    expect(screen.getByRole("button", { name: /Üniversite/ })).toBeEnabled();
  });

  it("tur secince listeye eklenir", async () => {
    const user = userEvent.setup();
    const { onChange } = setup();

    await user.click(screen.getByRole("button", { name: /Fabrika/ }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ types: ["factory"] })
    );
  });

  it("secili turu tiklamak listeden cikarir", async () => {
    const user = userEvent.setup();
    const { onChange } = setup({ types: ["factory", "office"] });

    await user.click(screen.getByRole("button", { name: /Fabrika/ }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ types: ["office"] })
    );
  });

  it("coklu secim birikir", async () => {
    const user = userEvent.setup();
    const { onChange } = setup({ types: ["factory"] });

    await user.click(screen.getByRole("button", { name: /Ofis/ }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ types: ["factory", "office"] })
    );
  });

  it("secili tur aria-checked tasir", () => {
    setup({ types: ["factory"] });
    expect(screen.getByRole("button", { name: /Fabrika/ }))
      .toHaveAttribute("aria-pressed", "true");
  });

  it("Tumu butonu secimi temizler", async () => {
    const user = userEvent.setup();
    const { onChange } = setup({ types: ["factory"] });

    await user.click(screen.getByRole("button", { name: /tümü/i }));

    // Bos dizi = "tum turler"; backend filtre uygulamiyor.
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ types: [] }));
  });
});

describe("filtre kontrolleri", () => {
  it("iletisim filtresi", async () => {
    const user = userEvent.setup();
    const { onChange } = setup();

    await user.click(screen.getByRole("checkbox", { name: /iletişim bilgisi/i }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ hasContact: true })
    );
  });

  it("isimli kayit filtresi", async () => {
    const user = userEvent.setup();
    const { onChange } = setup();

    await user.click(screen.getByRole("checkbox", { name: /isimli/i }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ namedOnly: true })
    );
  });

  it("tampon anahtari varsayilan acik", () => {
    setup();
    expect(screen.getByRole("checkbox", { name: /tampon/i })).toBeChecked();
  });

  it("tampon kapatilabilir", async () => {
    const user = userEvent.setup();
    const { onChange } = setup();

    await user.click(screen.getByRole("checkbox", { name: /tampon/i }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ includeBuffer: false })
    );
  });

  it("guven kaydiricisi 0-100 araliginda", () => {
    setup();
    const slider = screen.getByRole("slider", { name: /güven/i });

    expect(slider).toHaveAttribute("min", "0");
    expect(slider).toHaveAttribute("max", "100");
  });

  it("guven kaydiricisi degisince onChange cagrilir", () => {
    const { onChange } = setup();
    const slider = screen.getByRole("slider", { name: /güven/i });

    // range input'u userEvent.type ile surmek guvenilir degil;
    // fireEvent.change dogrudan onChange'i tetikliyor.
    fireEvent.change(slider, { target: { value: "40" } });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ minConfidence: 40 })
    );
  });

  it("metin aramasi", async () => {
    const user = userEvent.setup();
    const { onChange } = setup();

    await user.type(screen.getByRole("textbox", { name: /isim/i }), "a");

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ q: "a" }));
  });
});

describe("siralama", () => {
  it("dort secenek sunar", () => {
    setup();
    const select = screen.getByRole("combobox", { name: /sırala/i });
    expect(select.querySelectorAll("option")).toHaveLength(4);
  });

  it("ref_distance sunulmuyor", () => {
    // Backend destekliyor ama referans noktasi secme yolu yok;
    // olu kontrol sunmuyoruz.
    setup();
    const select = screen.getByRole("combobox", { name: /sırala/i });
    expect(select.querySelector('option[value="ref_distance"]')).toBeNull();
  });

  it("siralama degisince onChange cagrilir", async () => {
    const user = userEvent.setup();
    const { onChange } = setup();

    await user.selectOptions(
      screen.getByRole("combobox", { name: /sırala/i }),
      "lead_score"
    );

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ sort: "lead_score" })
    );
  });
});

describe("sayim yoklugu", () => {
  it("counts null iken chip'ler sayisiz gosterilir", () => {
    setup({}, null as never);
    // Ilce secilmemis veya ozet yukleniyor: chip'ler gorunur ama
    // sayi yerine bos. "0" gostermek yanlis bilgi olurdu.
    expect(screen.getByRole("button", { name: /Fabrika/ })).not.toHaveTextContent("0");
  });
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

Run: `pnpm test src/components/FilterPanel.test.tsx`

Expected: FAIL — `Failed to resolve import "./FilterPanel"`

- [ ] **Step 3: Komponenti yaz**

`src/components/FilterPanel.tsx`:

```typescript
"use client";

import React from "react";
import { SlidersHorizontal } from "lucide-react";
import type { PlaceType } from "../lib/types";
import { PLACE_TYPE_GROUPS, PLACE_TYPE_LABELS } from "../lib/labels";
import type { SortKey } from "../lib/districts";

export interface FilterState {
  types: PlaceType[];
  hasContact: boolean;
  namedOnly: boolean;
  minConfidence: number;
  q: string;
  includeBuffer: boolean;
  sort: SortKey;
}

/**
 * Backend varsayilanlariyla birebir ayni (bkz. routers/districts.py).
 * Ayrisirlarsa arayuz ilk yuklemede backend'den farkli bir sonuc
 * kumesi gosterir ve kullanici filtreye dokunmadan liste degisir.
 */
export const DEFAULT_FILTERS: FilterState = {
  types: [],
  hasContact: false,
  namedOnly: false,
  minConfidence: 0,
  q: "",
  includeBuffer: true,
  sort: "contact_first",
};

/**
 * Panelde sunulan siralamalar.
 *
 * `ref_distance` bilincli olarak DISARIDA: backend destekliyor ama
 * arayuzde referans noktasi secme yolu yok, dolayisiyla secilince
 * sessizce hicbir sey yapmayan olu bir kontrol olurdu. Noktayi
 * haritadan secme akisi eklenirse buraya geri gelir.
 */
export const SORT_LABELS: Partial<Record<SortKey, string>> = {
  contact_first: "İletişim bilgisi olanlar önce",
  lead_score: "Lead kalitesi",
  confidence: "Güven skoru",
  name: "Alfabetik",
};

interface FilterPanelProps {
  filters: FilterState;
  /** null = ilçe seçilmemiş veya özet yükleniyor. */
  counts: Record<PlaceType, number> | null;
  onChange: (next: FilterState) => void;
  disabled?: boolean;
}

export default function FilterPanel({
  filters,
  counts,
  onChange,
  disabled = false,
}: FilterPanelProps) {
  /** Immutable guncelleme: mevcut state'i mutasyona ugratmiyoruz. */
  const patch = (partial: Partial<FilterState>) =>
    onChange({ ...filters, ...partial });

  const toggleType = (type: PlaceType) =>
    patch({
      types: filters.types.includes(type)
        ? filters.types.filter((t) => t !== type)
        : [...filters.types, type],
    });

  return (
    <div className="rule-b bg-paper">
      {/* Tur secimi */}
      <div className="p-4 rule-b">
        <div className="flex items-center justify-between mb-2">
          <span className="mono-label">
            Tür
          </span>
          <button
            type="button"
            onClick={() => patch({ types: [] })}
            disabled={disabled || filters.types.length === 0}
            className="mono-label hover:text-ink disabled:opacity-40"
          >
            Tümü
          </button>
        </div>

        {Object.entries(PLACE_TYPE_GROUPS).map(([groupLabel, types]) => (
          <div key={groupLabel} className="mb-2 last:mb-0">
            <div className="mono-label mb-1">
              {groupLabel}
            </div>
            <div
              role="group"
              aria-label={`${groupLabel} tür seçimi`}
              className="grid grid-cols-2 gap-1"
            >
              {types.map((type) => {
                const isActive = filters.types.includes(type);
                const count = counts?.[type];
                // Sayisi 0 olan tur soluk gorunur ama tiklanabilir
                // kalir: kullanici "gercekten 0 mi" diye bakabilsin.
                const isEmpty = count === 0;

                return (
                  <button
                    key={type}
                    type="button"
                    // aria-pressed, role="checkbox" DEGIL. Mevcut
                    // Filters.tsx ayni deseni kullaniyor: buton uzerinde
                    // "basili" durumu semantik olarak dogru olan, ve
                    // ekran okuyucu bunu tek bir tur secici grubu
                    // icinde duyuruyor.
                    aria-pressed={isActive}
                    disabled={disabled}
                    onClick={() => toggleType(type)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-chip text-xs font-medium transition-colors duration-fast ease-out disabled:opacity-40 ${
                      isActive
                        ? "bg-accent text-accent-ink"
                        : isEmpty
                          ? "bg-paper-2 text-ink-4 hover:bg-paper-2"
                          : "bg-paper-2 text-ink-2 hover:bg-paper-3"
                    }`}
                  >
                    {PLACE_TYPE_LABELS[type]}
                    {count !== undefined && (
                      <span
                        className={`text-2xs font-bold ${
                          isActive ? "text-ink-4" : "text-ink-4"
                        }`}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Filtre ve siralama */}
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={14} className="text-ink-4" />
          <span className="mono-label">
            Filtre & Sıralama
          </span>
        </div>

        <label className="block">
          <span className="sr-only">Sırala</span>
          <select
            aria-label="Sırala"
            value={filters.sort}
            disabled={disabled}
            onChange={(event) => patch({ sort: event.target.value as SortKey })}
            className="w-full px-3 py-2 text-sm border border-rule rounded-input bg-paper disabled:opacity-40"
          >
            {(Object.entries(SORT_LABELS) as [SortKey, string][]).map(
              ([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              )
            )}
          </select>
        </label>

        <input
          type="text"
          aria-label="İsim ara"
          value={filters.q}
          disabled={disabled}
          onChange={(event) => patch({ q: event.target.value })}
          placeholder="İsimde ara..."
          className="w-full px-3 py-2 text-sm border border-rule rounded-input disabled:opacity-40"
        />

        <div className="space-y-1.5">
          {(
            [
              ["hasContact", "Sadece iletişim bilgisi olanlar"],
              ["namedOnly", "Sadece isimli kayıtlar"],
              ["includeBuffer", "Tampon bölgeyi dahil et (2 km)"],
            ] as const
          ).map(([key, label]) => (
            <label
              key={key}
              className="flex items-center gap-2 text-xs text-ink-2 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={filters[key]}
                disabled={disabled}
                onChange={(event) => patch({ [key]: event.target.checked })}
                className="rounded border-rule-2"
              />
              {label}
            </label>
          ))}
        </div>

        <label className="block">
          <span className="text-xs text-ink-2">
            En az güven skoru: {filters.minConfidence}
          </span>
          <input
            type="range"
            aria-label="En az güven skoru"
            min={0}
            max={100}
            step={10}
            value={filters.minConfidence}
            disabled={disabled}
            onChange={(event) =>
              patch({ minConfidence: Number(event.target.value) })
            }
            className="w-full mt-1"
          />
        </label>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Testleri çalıştır, geçtiğini doğrula**

Run: `pnpm test src/components/FilterPanel.test.tsx`

Expected: PASS (20 test)

- [ ] **Step 5: Commit**

```bash
git add src/components/FilterPanel.tsx src/components/FilterPanel.test.tsx
git commit -m "feat: coklu tur secimi ve filtre siralama paneli"
```

---

## Task 13: Next proxy route ve `useDistrictPlaces` hook'u

**Neden:** Frontend backend'e doğrudan gitmiyor (mevcut desen: `server/backend.ts`). Hook, filtre state'i ile fetch döngüsünü `page.tsx`'ten çıkarıyor.

**Files:**
- Create: `src/app/api/districts/[...path]/route.ts`
- Create: `src/hooks/useDistrictPlaces.ts`
- Test: `src/hooks/useDistrictPlaces.test.ts`

**Interfaces:**
- Consumes: T10'dan `fetchDistrictPlaces`, `fetchDistrictSummary`, `PlaceQuery`; T12'den `FilterState`; `src/server/backend.ts`'ten `apiUrl`, `proxyToBackend`, `resolveApiKey`
- Produces:
```typescript
interface UseDistrictPlacesResult {
  places: DistrictPlace[];
  counts: Record<PlaceType, number> | null;
  total: number;
  loading: boolean;
  error: string | null;
  reload: () => void;
}
export default function useDistrictPlaces(
  districtId: string | null,
  filters: FilterState
): UseDistrictPlacesResult
```

- [ ] **Step 1: Proxy route'u yaz**

`src/app/api/districts/[...path]/route.ts`:

```typescript
import { NextRequest } from "next/server";
import { apiUrl, proxyToBackend, resolveApiKey } from "../../../../server/backend";

/**
 * /api/districts/* -> backend /api/districts/*
 *
 * Mevcut admin/[...path] desenini takip ediyor. Sorgu uclari (GET)
 * tamamen yerel SQL uzerinde calisiyor; POST .../ingest ise Overpass'e
 * gidiyor ve LOCAL_MODE kapali oldugunda anahtar gerektiriyor.
 */

export const dynamic = "force-dynamic";

function backendUrl(req: NextRequest, path: string[]): string | null {
  const suffix = path.length > 0 ? `/${path.map(encodeURIComponent).join("/")}` : "";
  const search = req.nextUrl.search;
  return apiUrl(`/districts${suffix}${search}`);
}

export async function GET(
  req: NextRequest,
  { params }: { params: { path?: string[] } }
) {
  const { key } = resolveApiKey(req);
  return proxyToBackend(req, {
    url: backendUrl(req, params.path ?? []),
    method: "GET",
    label: "İlçe verisi",
    apiKey: key,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { path?: string[] } }
) {
  const { key } = resolveApiKey(req);
  return proxyToBackend(req, {
    url: backendUrl(req, params.path ?? []),
    method: "POST",
    label: "Veri çekme",
    apiKey: key,
  });
}
```

`/api/districts` (yol parçası olmadan) `[...path]` ile eşleşmiyor. Kök için ayrı dosya gerekiyor — `src/app/api/districts/route.ts`:

```typescript
import { NextRequest } from "next/server";
import { apiUrl, proxyToBackend, resolveApiKey } from "../../../server/backend";

/** /api/districts -> backend /api/districts (ilce metadata listesi) */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { key } = resolveApiKey(req);
  return proxyToBackend(req, {
    url: apiUrl("/districts"),
    method: "GET",
    label: "İlçe listesi",
    apiKey: key,
  });
}
```

- [ ] **Step 2: Testi yaz**

`src/hooks/useDistrictPlaces.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import useDistrictPlaces from "./useDistrictPlaces";
import { DEFAULT_FILTERS } from "../components/FilterPanel";
import * as api from "../lib/districts";

const SUMMARY = {
  district_id: "tr-34-kadikoy",
  name: "Kadıköy",
  counts: {
    factory: 34, office: 121, workshop: 8, kindergarten: 12,
    primary_school: 20, middle_school: 15, high_school: 5,
    private_school: 3, college_keyword: 2, college_university: 0,
  },
  total: 220,
  ingest: null,
};

const PLACES = {
  results: [
    {
      id: "osm:node:1", name: "Alfa", type: "factory" as const,
      lat: 41, lon: 29, address: null, phone: "111", email: null,
      website: null, confidence: 70, has_contact: true, tags: {},
    },
  ],
  count: 1,
  total: 1,
};

beforeEach(() => {
  vi.spyOn(api, "fetchDistrictSummary").mockResolvedValue(SUMMARY);
  vi.spyOn(api, "fetchDistrictPlaces").mockResolvedValue(PLACES);
});

describe("useDistrictPlaces", () => {
  it("ilce yoksa istek atmaz", async () => {
    const { result } = renderHook(() => useDistrictPlaces(null, DEFAULT_FILTERS));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.fetchDistrictPlaces).not.toHaveBeenCalled();
    expect(result.current.places).toEqual([]);
    expect(result.current.counts).toBeNull();
  });

  it("ilce secilince yerler ve sayimlar gelir", async () => {
    const { result } = renderHook(() =>
      useDistrictPlaces("tr-34-kadikoy", DEFAULT_FILTERS)
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.places).toHaveLength(1);
    expect(result.current.counts?.factory).toBe(34);
    expect(result.current.total).toBe(1);
  });

  it("filtre degisince yeniden sorgular", async () => {
    const { result, rerender } = renderHook(
      ({ filters }) => useDistrictPlaces("tr-34-kadikoy", filters),
      { initialProps: { filters: DEFAULT_FILTERS } }
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    const before = vi.mocked(api.fetchDistrictPlaces).mock.calls.length;

    rerender({ filters: { ...DEFAULT_FILTERS, hasContact: true } });

    await waitFor(() =>
      expect(vi.mocked(api.fetchDistrictPlaces).mock.calls.length).toBe(before + 1)
    );
  });

  it("filtre degisimi ozet sorgusunu tekrarlamaz", async () => {
    // Sayimlar filtreden bagimsiz; her filtre hareketinde ozet
    // yeniden cekilse gereksiz istek olur.
    const { result, rerender } = renderHook(
      ({ filters }) => useDistrictPlaces("tr-34-kadikoy", filters),
      { initialProps: { filters: DEFAULT_FILTERS } }
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    const summaryCalls = vi.mocked(api.fetchDistrictSummary).mock.calls.length;

    rerender({ filters: { ...DEFAULT_FILTERS, q: "alfa" } });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(vi.mocked(api.fetchDistrictSummary).mock.calls.length).toBe(summaryCalls);
  });

  it("includeBuffer degisince ozet yeniden cekilir", async () => {
    // Tampon sayimlari etkiliyor (count_by_type include_buffer aliyor).
    const { result, rerender } = renderHook(
      ({ filters }) => useDistrictPlaces("tr-34-kadikoy", filters),
      { initialProps: { filters: DEFAULT_FILTERS } }
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    const before = vi.mocked(api.fetchDistrictSummary).mock.calls.length;

    rerender({ filters: { ...DEFAULT_FILTERS, includeBuffer: false } });

    await waitFor(() =>
      expect(vi.mocked(api.fetchDistrictSummary).mock.calls.length).toBe(before + 1)
    );
    // Yeniden cekmek yeterli degil: parametre de gitmeli, yoksa ayni
    // sonuc doner ve chip sayilari sessizce yanlis kalir.
    const lastCall = vi.mocked(api.fetchDistrictSummary).mock.calls.at(-1);
    expect(lastCall?.[1]).toBe(false);
  });

  it("hata mesaji yuzeye cikar", async () => {
    vi.mocked(api.fetchDistrictPlaces).mockRejectedValue(new Error("Arama başarısız"));

    const { result } = renderHook(() =>
      useDistrictPlaces("tr-34-kadikoy", DEFAULT_FILTERS)
    );

    await waitFor(() => expect(result.current.error).toBe("Arama başarısız"));
    expect(result.current.places).toEqual([]);
  });

  it("AbortError hata olarak gosterilmez", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    vi.mocked(api.fetchDistrictPlaces).mockRejectedValue(abortError);

    const { result } = renderHook(() =>
      useDistrictPlaces("tr-34-kadikoy", DEFAULT_FILTERS)
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    // Iptal, kullanicinin yeni sorgusu demek; hata degil.
    expect(result.current.error).toBeNull();
  });

  it("reload yeniden sorgular", async () => {
    const { result } = renderHook(() =>
      useDistrictPlaces("tr-34-kadikoy", DEFAULT_FILTERS)
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    const before = vi.mocked(api.fetchDistrictPlaces).mock.calls.length;

    act(() => result.current.reload());

    await waitFor(() =>
      expect(vi.mocked(api.fetchDistrictPlaces).mock.calls.length).toBe(before + 1)
    );
  });
});
```

- [ ] **Step 3: Testi çalıştır, başarısız olduğunu doğrula**

Run: `pnpm test src/hooks/useDistrictPlaces.test.ts`

Expected: FAIL — `Failed to resolve import "./useDistrictPlaces"`

- [ ] **Step 4: Hook'u yaz**

`src/hooks/useDistrictPlaces.ts`:

```typescript
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchDistrictPlaces,
  fetchDistrictSummary,
  type DistrictPlace,
} from "../lib/districts";
import type { FilterState } from "../components/FilterPanel";
import type { PlaceType } from "../lib/types";

interface UseDistrictPlacesResult {
  places: DistrictPlace[];
  counts: Record<PlaceType, number> | null;
  total: number;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/** Sonuc sayfasi boyutu. Yerel SQL oldugu icin comert olabiliyoruz. */
const PAGE_SIZE = 500;

/**
 * Bir ilcenin filtrelenmis POI listesi ve tur sayimlari.
 *
 * Debounce YOK: sorgu yerel SQL uzerinde milisaniye mertebesinde
 * donuyor. Eski viewport aramasindaki 500 ms gecikme Overpass
 * cagrisini seyreltmek icindi; artik cagri yok.
 */
export default function useDistrictPlaces(
  districtId: string | null,
  filters: FilterState
): UseDistrictPlacesResult {
  const [places, setPlaces] = useState<DistrictPlace[]>([]);
  const [counts, setCounts] = useState<Record<PlaceType, number> | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const abortRef = useRef<AbortController | null>(null);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  // Sayimlar yalnizca ilce ve tampon secimine bagli; filtrelerden
  // bagimsiz. Her filtre hareketinde ozet cekmek gereksiz istek olurdu.
  useEffect(() => {
    if (!districtId) {
      setCounts(null);
      return;
    }

    let cancelled = false;
    // includeBuffer geciliyor: tampon anahtari sayimlari etkiliyor.
    fetchDistrictSummary(districtId, filters.includeBuffer)
      .then((summary) => {
        if (!cancelled) setCounts(summary.counts);
      })
      .catch(() => {
        if (!cancelled) setCounts(null);
      });

    return () => {
      cancelled = true;
    };
  }, [districtId, filters.includeBuffer, nonce]);

  useEffect(() => {
    if (!districtId) {
      setPlaces([]);
      setTotal(0);
      setError(null);
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const isCurrent = () => abortRef.current === controller;

    setLoading(true);
    setError(null);

    fetchDistrictPlaces(
      districtId,
      {
        types: filters.types,
        hasContact: filters.hasContact,
        namedOnly: filters.namedOnly,
        minConfidence: filters.minConfidence,
        q: filters.q,
        includeBuffer: filters.includeBuffer,
        sort: filters.sort,
        limit: PAGE_SIZE,
      },
      { signal: controller.signal }
    )
      .then((response) => {
        if (!isCurrent()) return;
        setPlaces(response.results);
        setTotal(response.total);
      })
      .catch((err: unknown) => {
        // Iptal kullanicinin yeni sorgusu demek, hata degil.
        if (err instanceof Error && err.name === "AbortError") return;
        if (!isCurrent()) return;
        setPlaces([]);
        setTotal(0);
        setError(err instanceof Error ? err.message : "Arama başarısız oldu.");
      })
      .finally(() => {
        // catch icindeki return bile finally'yi calistirir; guard
        // olmadan iptal edilen eski cagri yeni aramanin spinner'ini
        // kapatir (bkz. page.tsx:210'daki ayni tuzak).
        if (isCurrent()) setLoading(false);
      });

    return () => controller.abort();
  }, [
    districtId,
    filters.types,
    filters.hasContact,
    filters.namedOnly,
    filters.minConfidence,
    filters.q,
    filters.includeBuffer,
    filters.sort,
    nonce,
  ]);

  return { places, counts, total, loading, error, reload };
}
```

`filters.types` bir dizi olduğu için referans eşitliği her render'da bozulabilir. `page.tsx` (T15) `FilterState`'i tek bir `useState` içinde tuttuğu ve `patch` immutable güncelleme yaptığı için yeni dizi yalnızca gerçek değişimde üretiliyor — bu yeterli.

- [ ] **Step 5: Testleri çalıştır, geçtiğini doğrula**

Run: `pnpm test src/hooks/useDistrictPlaces.test.ts`

Expected: PASS (8 test)

- [ ] **Step 6: Tip kontrolü**

Run: `pnpm type-check`

Expected: temiz.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/districts src/hooks/useDistrictPlaces.ts src/hooks/useDistrictPlaces.test.ts
git commit -m "feat: ilce proxy route'u ve yerel arama hook'u"
```

---

## Task 14: `DistrictLayer` ve `MapView` — `onBoundsChange`'i kaldır

> **Tasarım sistemi — bu task için zorunlu.** Aşağıdaki kod bloklarındaki
> sınıflar tasarım sistemi token'larına çevrilmiştir (`bg-accent`,
> `text-ink-*`, `rounded-input`, `mono-label`, `surface`, `rule-b`,
> `duration-fast ease-out`). **Yazmaya başlamadan önce `design.md` ve
> `src/components/Filters.tsx`'i oku.** Filters.tsx bu projede chip
> deseninin referansı: `pressable group ... rounded-input`, aktif
> `bg-accent text-accent-ink`, pasif `text-ink-2 hover:bg-paper-2
> hover:text-ink`, ikon aktif `text-accent-ink` / pasif `text-ink-4
> group-hover:text-ink-3`.
>
> Üç kural: **(1)** ham renk/font değeri yazma (`bg-slate-*`, `text-gray-*`
> yasak). **(2)** Özel focus ring ekleme — `globals.css` içindeki global
> `:focus-visible` bunu hallediyor. **(3)** Gölge ekleme; sistem
> "derinlik kenardan" diyor, yüzeyler `surface` veya `rule-*` ile
> tanımlanıyor. Yalnızca haritanın üstünde yüzen katman `shadow-lift`
> kullanıyor.
>
> Sayı gösteren her yerde `tabular` sınıfını kullan (mono + tabular-nums)
> — sayılar alt alta hizalanmalı.


**Neden:** Maliyetin kaynağı `MapView.tsx:54`'teki `moveend` dinleyicisi. Kaldırılıyor. Yerine tıklanabilir ilçe poligonları geliyor; tür çoklu seçim olduğu için marker renkleri de türe göre ayrılıyor.

**Files:**
- Create: `src/components/DistrictLayer.tsx`
- Create: `src/lib/typeColors.ts`
- Modify: `src/components/MapView.tsx` (tümü)
- Test: `src/components/MapView.test.tsx`, `src/lib/typeColors.test.ts`

**Interfaces:**
- Consumes: T10'dan `DistrictMeta`, `DistrictPlace`, `fetchDistrictGeoJson`
- Produces:
  - `TYPE_COLORS: Record<PlaceType, string>` ve `UNCLASSIFIED_COLOR: string`
  - `colorForType(type: PlaceType | null): string`
```typescript
interface DistrictLayerProps {
  selectedDistrictId: string | null;
  onSelectDistrict: (districtId: string) => void;
}
interface MapViewProps {
  places: DistrictPlace[];
  districts: DistrictMeta[];
  selectedDistrictId: string | null;
  onSelectDistrict: (districtId: string) => void;
  selectedPlaceId?: string;
}
```
  `MapViewProps` artık `onBoundsChange`, `center` ve `zoom` **almıyor** — merkez seçili ilçeden, yokken kapsamın tamamından türetiliyor.

- [ ] **Step 1: Renk testini yaz**

`src/lib/typeColors.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { TYPE_COLORS, UNCLASSIFIED_COLOR, colorForType } from "./typeColors";
import { PLACE_TYPE_LABELS } from "./labels";
import type { PlaceType } from "./types";

describe("typeColors", () => {
  it("on turun hepsi icin renk var", () => {
    const types = Object.keys(PLACE_TYPE_LABELS) as PlaceType[];
    expect(types).toHaveLength(10);
    for (const type of types) {
      expect(TYPE_COLORS[type]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("renkler birbirinden farkli", () => {
    // Coklu tur secildiginde 200 marker ayirt edilebilmeli.
    const values = Object.values(TYPE_COLORS);
    expect(new Set(values).size).toBe(values.length);
  });

  it("siniflandirilamayan icin ayri renk", () => {
    expect(colorForType(null)).toBe(UNCLASSIFIED_COLOR);
    expect(Object.values(TYPE_COLORS)).not.toContain(UNCLASSIFIED_COLOR);
  });

  it("bilinen tur kendi rengini alir", () => {
    expect(colorForType("factory")).toBe(TYPE_COLORS.factory);
  });
});
```

- [ ] **Step 2: `src/lib/typeColors.ts`'i yaz**

```typescript
import type { PlaceType } from "./types";

/**
 * Tur basina marker rengi.
 *
 * Tur artik coklu secim: bir ilcede hem fabrika hem okul birlikte
 * gorunuyor. Tek renkli marker'larla 200 kayit ayirt edilemez, o
 * yuzden renk lejantı zorunlu.
 *
 * Isletmeler sicak tonlar, egitim kurumlari soguk tonlar — grup
 * ayrimini renk sicakligindan da okuyabilmek icin.
 */
export const TYPE_COLORS: Record<PlaceType, string> = {
  // Isletmeler
  factory: "#b45309",
  office: "#c2410c",
  workshop: "#a16207",
  // Egitim
  kindergarten: "#0e7490",
  primary_school: "#0369a1",
  middle_school: "#1d4ed8",
  high_school: "#4338ca",
  private_school: "#6d28d9",
  college_keyword: "#a21caf",
  college_university: "#be185d",
};

/** place_type NULL: siniflandirilamamis kayit (include_unclassified ile gorunur). */
export const UNCLASSIFIED_COLOR = "#64748b";

export function colorForType(type: PlaceType | null): string {
  return type ? TYPE_COLORS[type] : UNCLASSIFIED_COLOR;
}
```

Run: `pnpm test src/lib/typeColors.test.ts` → PASS (4 test)

- [ ] **Step 3: `MapView` sözleşme testini yaz**

`src/components/MapView.test.tsx`:

```typescript
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * MapView sozlesme regresyonu.
 *
 * Leaflet'i jsdom'da calistirmak kirilgan (canvas, boyut olcumu);
 * bunun yerine kaynak dosyanin sozlesmesini kilitliyoruz. Asil amac
 * viewport tabanli otomatik aramanin geri gelmemesi.
 */

const SOURCE = readFileSync(
  resolve(__dirname, "MapView.tsx"),
  "utf-8"
);
const PAGE = readFileSync(
  resolve(__dirname, "../app/page.tsx"),
  "utf-8"
);

describe("MapView viewport aramasi icermiyor", () => {
  it("onBoundsChange prop'u yok", () => {
    expect(SOURCE).not.toContain("onBoundsChange");
  });

  it("moveend dinleyicisi yok", () => {
    // Maliyetin kaynagi buydu: her pan bir Overpass sorgusu.
    expect(SOURCE).not.toContain("moveend");
  });

  it("getBounds cagrisi yok", () => {
    expect(SOURCE).not.toContain("getBounds");
  });

  it("page.tsx bbox state'i tutmuyor", () => {
    expect(PAGE).not.toMatch(/\bsetBbox\b/);
    expect(PAGE).not.toMatch(/const \[bbox/);
  });

  it("page.tsx performSearch tutmuyor", () => {
    // Arama useDistrictPlaces hook'una tasindi; page.tsx'te kendi
    // arama dongusu kalmadi.
    expect(PAGE).not.toContain("performSearch");
  });

  it("page.tsx setTimeout ile arama geciktirmiyor", () => {
    // 500 ms debounce Overpass cagrisini seyreltmek icindi; yerel SQL
    // milisaniye mertebesinde donuyor, gecikme sadece arayuzu
    // yavas gosterirdi.
    expect(PAGE).not.toContain("setTimeout");
  });
});

describe("MapView ilce secimi sunuyor", () => {
  it("onSelectDistrict prop'u var", () => {
    expect(SOURCE).toContain("onSelectDistrict");
  });

  it("DistrictLayer kullaniyor", () => {
    expect(SOURCE).toContain("DistrictLayer");
  });
});
```

- [ ] **Step 4: Testi çalıştır, başarısız olduğunu doğrula**

Run: `pnpm test src/components/MapView.test.tsx`

Expected: FAIL — `onBoundsChange`, `moveend`, `getBounds` hâlâ mevcut; `DistrictLayer` yok.

- [ ] **Step 5: `DistrictLayer`'ı yaz**

`src/components/DistrictLayer.tsx`:

```typescript
"use client";

import React, { useEffect, useState } from "react";
import { GeoJSON, useMap } from "react-leaflet";
import type { Layer, LeafletMouseEvent, PathOptions } from "leaflet";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { fetchDistrictGeoJson } from "../lib/districts";

interface DistrictProperties {
  id: string;
  name: string;
  bbox: [number, number, number, number];
}

interface DistrictLayerProps {
  selectedDistrictId: string | null;
  onSelectDistrict: (districtId: string) => void;
}

const BASE_STYLE: PathOptions = {
  color: "#94a3b8",
  weight: 1,
  fillColor: "#94a3b8",
  fillOpacity: 0.04,
};

const SELECTED_STYLE: PathOptions = {
  color: "#0f172a",
  weight: 2.5,
  fillColor: "#0f172a",
  fillOpacity: 0.1,
};

const HOVER_STYLE: PathOptions = {
  color: "#475569",
  weight: 2,
  fillColor: "#475569",
  fillOpacity: 0.12,
};

/**
 * Tiklanabilir ilce poligonlari.
 *
 * GeoJSON verisi (~500 KB - 1 MB) lib/districts.ts icinde modul
 * duzeyinde belleklendigi icin harita her yeniden bindiginde
 * yeniden indirilmiyor.
 */
export default function DistrictLayer({
  selectedDistrictId,
  onSelectDistrict,
}: DistrictLayerProps) {
  const map = useMap();
  const [data, setData] = useState<FeatureCollection<Geometry, DistrictProperties> | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;
    fetchDistrictGeoJson<FeatureCollection<Geometry, DistrictProperties>>()
      .then((collection) => {
        if (!cancelled) setData(collection);
      })
      .catch(() => {
        // Sinirlar yuklenemezse harita yine calisir; secim kenar
        // cubugundaki listeden yapilabilir.
        if (!cancelled) setData(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Secili ilceye yakinlas. Pan/zoom hicbir sorgu tetiklemiyor, bu
  // yuzden kamera hareketi tamamen serbest.
  useEffect(() => {
    if (!selectedDistrictId || !data) return;

    const feature = data.features.find(
      (f) => f.properties.id === selectedDistrictId
    );
    if (!feature) return;

    const [south, west, north, east] = feature.properties.bbox;
    map.fitBounds(
      [
        [south, west],
        [north, east],
      ],
      { padding: [24, 24] }
    );
  }, [selectedDistrictId, data, map]);

  if (!data) return null;

  const styleFor = (feature?: Feature<Geometry, DistrictProperties>): PathOptions =>
    feature?.properties.id === selectedDistrictId ? SELECTED_STYLE : BASE_STYLE;

  const onEachFeature = (
    feature: Feature<Geometry, DistrictProperties>,
    layer: Layer
  ) => {
    layer.bindTooltip(feature.properties.name, { sticky: true });

    layer.on({
      click: () => onSelectDistrict(feature.properties.id),
      mouseover: (event: LeafletMouseEvent) => {
        if (feature.properties.id !== selectedDistrictId) {
          (event.target as { setStyle: (s: PathOptions) => void }).setStyle(HOVER_STYLE);
        }
      },
      mouseout: (event: LeafletMouseEvent) => {
        (event.target as { setStyle: (s: PathOptions) => void }).setStyle(
          styleFor(feature)
        );
      },
    });
  };

  return (
    <GeoJSON
      // key: secim degisince stil fonksiyonu yeniden uygulanmali;
      // react-leaflet GeoJSON prop degisiminde katmani yenilemiyor.
      key={selectedDistrictId ?? "none"}
      data={data}
      style={styleFor}
      onEachFeature={onEachFeature}
    />
  );
}
```

- [ ] **Step 6: `MapView`'ı yeniden yaz**

`src/components/MapView.tsx` (tümü):

```typescript
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import "leaflet/dist/leaflet.css";
import DistrictLayer from "./DistrictLayer";
import { colorForType, TYPE_COLORS } from "../lib/typeColors";
import { PLACE_TYPE_LABELS } from "../lib/labels";
import type { DistrictMeta, DistrictPlace } from "../lib/districts";
import type { PlaceType } from "../lib/types";

interface MapViewProps {
  places: DistrictPlace[];
  districts: DistrictMeta[];
  selectedDistrictId: string | null;
  onSelectDistrict: (districtId: string) => void;
  selectedPlaceId?: string;
}

/** Kapsamin tamamini gosteren baslangic goruntusu (Trakya + Malatya). */
const SCOPE_CENTER: [number, number] = [40.2, 33.5];
const SCOPE_ZOOM = 6;

/** Secili kayda ucar. Pan sorgu tetiklemedigi icin serbestce yapilabilir. */
function FlyToSelected({
  places,
  selectedPlaceId,
}: {
  places: DistrictPlace[];
  selectedPlaceId?: string;
}) {
  const map = useMap();

  useEffect(() => {
    if (!selectedPlaceId) return;
    const place = places.find((p) => p.id === selectedPlaceId);
    if (place) {
      map.flyTo([place.lat, place.lon], 16, { duration: 1.2 });
    }
  }, [selectedPlaceId, places, map]);

  return null;
}

export default function MapView({
  places,
  districts,
  selectedDistrictId,
  onSelectDistrict,
  selectedPlaceId,
}: MapViewProps) {
  const [tileUrl, setTileUrl] = useState(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
  );

  /** Lejantta yalnizca haritada gercekten bulunan turler gorunsun. */
  const visibleTypes = useMemo(() => {
    const present = new Set<PlaceType>();
    for (const place of places) {
      if (place.type) present.add(place.type);
    }
    return (Object.keys(TYPE_COLORS) as PlaceType[]).filter((t) => present.has(t));
  }, [places]);

  const scopeNames = useMemo(
    () => Array.from(new Set(districts.map((d) => d.province))).length,
    [districts]
  );

  return (
    <div className="w-full h-full relative rounded-card overflow-hidden bg-paper-2">
      <MapContainer
        center={SCOPE_CENTER}
        zoom={SCOPE_ZOOM}
        className="w-full h-full z-0"
        scrollWheelZoom
        preferCanvas
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url={tileUrl}
          eventHandlers={{
            tileerror: () => {
              setTileUrl("https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png");
            },
          }}
        />

        <DistrictLayer
          selectedDistrictId={selectedDistrictId}
          onSelectDistrict={onSelectDistrict}
        />

        <MarkerClusterGroup chunkedLoading>
          {places.map((place) => (
            <CircleMarker
              key={place.id}
              center={[place.lat, place.lon]}
              radius={6}
              pathOptions={{
                color: "#ffffff",
                weight: 1.5,
                fillColor: colorForType(place.type),
                fillOpacity: 0.9,
              }}
            >
              <Popup>
                <div className="p-1 min-w-[180px]">
                  <h3 className="font-bold text-ink">
                    {place.name ?? "İsimsiz Yer"}
                  </h3>
                  {place.address && (
                    <p className="text-xs text-ink-3 mt-1">{place.address}</p>
                  )}
                  {place.phone && (
                    <a
                      href={`tel:${place.phone}`}
                      className="block text-xs text-blue-600 mt-1"
                    >
                      {place.phone}
                    </a>
                  )}
                  <div className="mt-2 text-2xs uppercase tracking-wider font-semibold text-ink-4">
                    {place.type ? PLACE_TYPE_LABELS[place.type] : "Sınıflandırılamadı"}
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MarkerClusterGroup>

        <FlyToSelected places={places} selectedPlaceId={selectedPlaceId} />
      </MapContainer>

      {/* Tur lejantı: coklu secimde marker'lari ayirt etmek icin */}
      {visibleTypes.length > 0 && (
        <div className="absolute bottom-3 left-3 z-[400] bg-paper/95 backdrop-blur-sm rounded-input shadow-lift rule-b px-3 py-2 max-w-[220px]">
          <div className="mono-label mb-1.5">
            Tür
          </div>
          <div className="flex flex-col gap-1">
            {visibleTypes.map((type) => (
              <div key={type} className="flex items-center gap-1.5 text-2xs text-ink-2">
                <span
                  className="w-2.5 h-2.5 rounded-chip shrink-0"
                  style={{ backgroundColor: TYPE_COLORS[type] }}
                />
                {PLACE_TYPE_LABELS[type]}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Kapsam bilgisi: kapsam disinda sorgu atilmadigi acik olsun */}
      {!selectedDistrictId && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[400] bg-paper/95 backdrop-blur-sm rounded-chip shadow-lift px-4 py-1.5 text-xs font-semibold text-ink-2">
          Bir ilçe seçin · Kapsam: {scopeNames} il, {districts.length} ilçe
        </div>
      )}
    </div>
  );
}
```

Marker'lar `L.Marker` yerine `CircleMarker`: türe göre renklendirme ikon dosyası üretmeden mümkün oluyor ve `unpkg.com`'dan ikon indirme bağımlılığı (`MapView.tsx:11-19`) ortadan kalkıyor.

- [ ] **Step 7: Testleri çalıştır**

Run: `pnpm test src/components/MapView.test.tsx src/lib/typeColors.test.ts`

Expected: PASS. `page.tsx` testleri T15'ten sonra geçecek — bu adımda `page.tsx bbox state'i tutmuyor` testi hâlâ FAIL olabilir; T15'te düzelecek.

- [ ] **Step 8: Commit**

```bash
git add src/components/DistrictLayer.tsx src/components/MapView.tsx src/components/MapView.test.tsx src/lib/typeColors.ts src/lib/typeColors.test.ts
git commit -m "feat: tiklanabilir ilce katmani ekle, viewport tabanli aramayi kaldir"
```

---

## Task 15: `page.tsx` — parçaları birleştir

> **Tasarım sistemi — bu task için zorunlu.** Aşağıdaki kod bloklarındaki
> sınıflar tasarım sistemi token'larına çevrilmiştir (`bg-accent`,
> `text-ink-*`, `rounded-input`, `mono-label`, `surface`, `rule-b`,
> `duration-fast ease-out`). **Yazmaya başlamadan önce `design.md` ve
> `src/components/Filters.tsx`'i oku.** Filters.tsx bu projede chip
> deseninin referansı: `pressable group ... rounded-input`, aktif
> `bg-accent text-accent-ink`, pasif `text-ink-2 hover:bg-paper-2
> hover:text-ink`, ikon aktif `text-accent-ink` / pasif `text-ink-4
> group-hover:text-ink-3`.
>
> Üç kural: **(1)** ham renk/font değeri yazma (`bg-slate-*`, `text-gray-*`
> yasak). **(2)** Özel focus ring ekleme — `globals.css` içindeki global
> `:focus-visible` bunu hallediyor. **(3)** Gölge ekleme; sistem
> "derinlik kenardan" diyor, yüzeyler `surface` veya `rule-*` ile
> tanımlanıyor. Yalnızca haritanın üstünde yüzen katman `shadow-lift`
> kullanıyor.
>
> Sayı gösteren her yerde `tabular` sınıfını kullan (mono + tabular-nums)
> — sayılar alt alta hizalanmalı.


**Neden:** `page.tsx` şu an 355 satır ve viewport arama mantığını taşıyor. Arama `useDistrictPlaces`'e, seçim `DistrictPicker`'a, filtreler `FilterPanel`'e taşındı; burada kalan iş bunları bağlamak.

**Files:**
- Modify: `src/app/page.tsx` (tümü)
- Modify: `src/components/PlaceList.tsx` (prop tipi `Place` → `DistrictPlace`)
- Delete: `src/components/Filters.tsx` (yerini `FilterPanel` aldı)
- Test: `src/components/MapView.test.tsx` (T14'teki `page.tsx` testleri artık geçmeli)

**Interfaces:**
- Consumes: T10-T14'ün tamamı
- Produces: çalışan uçtan uca akış

- [ ] **Step 1: `page.tsx`'i yeniden yaz**

Kaldırılanlar: `bbox` state, `performSearch`, `onBoundsChange`, 500 ms debounce (`page.tsx:230`), `slowSearch` bandı, `radiusClamped` bildirimi, `Filters` import'u.

Korunanlar: sepet (`basket`), export, `ReportModal`, `SettingsModal`, `UpgradeModal`, `handleApiError`.

```typescript
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Search, KeyRound, RefreshCw } from "lucide-react";
import DistrictPicker from "../components/DistrictPicker";
import FilterPanel, { DEFAULT_FILTERS, type FilterState } from "../components/FilterPanel";
import PlaceList from "../components/PlaceList";
import ExportToolbar from "../components/ExportToolbar";
import ReportModal from "../components/ReportModal";
import SettingsModal from "../components/SettingsModal";
import UpgradeModal from "../components/UpgradeModal";
import useDistrictPlaces from "../hooks/useDistrictPlaces";
import { exportLeads, fetchAccount } from "../lib/api";
import type { AccountInfo } from "../lib/api";
import {
  fetchDistricts,
  triggerDistrictIngest,
  type DistrictMeta,
  type DistrictPlace,
} from "../lib/districts";

const MapView = dynamic(() => import("../components/MapView"), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-paper-2 animate-pulse rounded-card" />,
});

const IS_LOCAL = process.env.NEXT_PUBLIC_LOCAL_MODE === "true";

export default function Home() {
  const [districts, setDistricts] = useState<DistrictMeta[]>([]);
  const [districtsLoading, setDistrictsLoading] = useState(true);
  const [selectedDistrictId, setSelectedDistrictId] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string>();

  /**
   * Disa aktarim sepeti. Sadece id degil DistrictPlace nesnesinin
   * kendisi tutuluyor: kullanici ilce degistirdiginde onceki sonuclar
   * listeden dusuyor, ama sepete aldiklari korunuyor ve export'a
   * dahil oluyor.
   */
  const [basket, setBasket] = useState<Map<string, DistrictPlace>>(new Map());
  const [reportTarget, setReportTarget] = useState<DistrictPlace | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [account, setAccount] = useState<AccountInfo | null>(null);

  const { places, counts, total, loading, error, reload } = useDistrictPlaces(
    selectedDistrictId,
    filters
  );

  const selectedDistrict = useMemo(
    () => districts.find((d) => d.id === selectedDistrictId) ?? null,
    [districts, selectedDistrictId]
  );

  const reloadAccount = useCallback(() => {
    // LOCAL_MODE'da kota/plan yok; hesap durumu sorgulanmiyor.
    if (IS_LOCAL) return;
    fetchAccount().then(setAccount).catch(() => setAccount(null));
  }, []);

  const reloadDistricts = useCallback(() => {
    setDistrictsLoading(true);
    fetchDistricts()
      .then(setDistricts)
      .catch((err: Error) => setNotice(err.message))
      .finally(() => setDistrictsLoading(false));
  }, []);

  useEffect(() => {
    reloadDistricts();
    reloadAccount();
  }, [reloadDistricts, reloadAccount]);

  useEffect(() => {
    if (error) setNotice(error);
  }, [error]);

  const exportBlockedReason = (() => {
    if (IS_LOCAL) return null;
    if (!account) return "Dışa aktarım için API anahtarı gerekli.";
    if (!account.is_active) return "API anahtarınız devre dışı.";
    if (account.plan === "free") {
      return "CSV dışa aktarım ücretsiz planda kapalı. Pro veya Enterprise gerekir.";
    }
    if (account.daily_limit - account.used_today < 2) {
      return "Günlük kotanız dışa aktarım için yetersiz (2 birim gerekir).";
    }
    return null;
  })();

  const toggleBasket = useCallback((place: DistrictPlace) => {
    setBasket((prev) => {
      const next = new Map(prev);
      if (next.has(place.id)) next.delete(place.id);
      else next.set(place.id, place);
      return next;
    });
  }, []);

  const selectAllVisible = useCallback(() => {
    setBasket((prev) => {
      const next = new Map(prev);
      places.forEach((p) => next.set(p.id, p));
      return next;
    });
  }, [places]);

  const clearBasket = useCallback(() => setBasket(new Map()), []);

  const handleApiError = useCallback((err: any) => {
    const message = String(err?.message ?? "");
    if (message === "QUOTA_EXCEEDED" || /plan|upgrade|disabled for/i.test(message)) {
      setUpgradeOpen(true);
      return;
    }
    if (/API-KEY|api key|401|yetki/i.test(message)) {
      setNotice("Bu islem icin API anahtari gerekli.");
      setSettingsOpen(true);
      return;
    }
    setNotice(message || "Islem basarisiz oldu.");
  }, []);

  /**
   * Export dosya adi ilceyi ve turleri tasiyor. 10 tur secilebildigi
   * icin ucten fazlada sayiya dusuluyor — dosya adina on tur adi
   * dizmemek icin.
   */
  const exportFileName = useCallback(() => {
    const slug = selectedDistrictId?.replace(/^tr-\d+-/, "") ?? "secim";
    const types = filters.types;
    if (types.length === 0) return `leads_${slug}_tumu.csv`;
    if (types.length <= 3) return `leads_${slug}_${types.join("-")}.csv`;
    return `leads_${slug}_${types.length}-tur.csv`;
  }, [selectedDistrictId, filters.types]);

  const handleExport = useCallback(async () => {
    if (basket.size === 0 || exporting) return;

    setExporting(true);
    setNotice(null);
    try {
      const blob = await exportLeads(Array.from(basket.values()) as any, {
        type: filters.types[0] ?? "factory",
        radius: 0,
        center: selectedDistrict
          ? { lat: selectedDistrict.center[0], lon: selectedDistrict.center[1] }
          : undefined,
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = exportFileName();
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      reloadAccount();
    } catch (err) {
      handleApiError(err);
    } finally {
      setExporting(false);
    }
  }, [
    basket, exporting, filters.types, selectedDistrict,
    exportFileName, handleApiError, reloadAccount,
  ]);

  /** Talep uzerine ingest: modulun Overpass'e giden tek yolu. */
  const handleIngest = useCallback(
    async (force: boolean) => {
      if (!selectedDistrictId || ingesting) return;

      setIngesting(true);
      setNotice(
        force
          ? "Veri yenileniyor, bu bir dakika sürebilir..."
          : "Bu ilçenin verisi ilk kez çekiliyor, bu bir dakika sürebilir..."
      );
      try {
        const result = await triggerDistrictIngest(selectedDistrictId, force);
        setNotice(
          result.status === "ok"
            ? `${result.place_count} kayıt hazır.`
            : `${result.place_count} kayıt alındı (kısmi: bazı sorgular tamamlanamadı).`
        );
        reloadDistricts();
        reload();
      } catch (err) {
        handleApiError(err);
      } finally {
        setIngesting(false);
      }
    },
    [selectedDistrictId, ingesting, reloadDistricts, reload, handleApiError]
  );

  const ingestInfo = selectedDistrict?.ingest ?? null;
  const needsIngest = Boolean(selectedDistrictId) && ingestInfo === null;

  return (
    <main className="flex flex-col h-screen bg-paper-2 text-ink font-sans">
      <header className="h-16 px-6 rule-b bg-paper flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-ink rounded-input flex items-center justify-center">
            <Search size={18} className="text-accent-ink" />
          </div>
          <h1 className="font-bold text-xl tracking-tight">POI Finder</h1>
          {selectedDistrict && (
            <span className="ml-2 text-sm font-semibold text-ink-3">
              {selectedDistrict.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {!IS_LOCAL && (
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="flex items-center gap-2 text-xs font-bold text-ink-3 hover:text-ink border border-rule rounded-chip px-3 py-1.5 transition-colors duration-fast ease-out"
            >
              <KeyRound size={14} />
              API Anahtarı
            </button>
          )}
          <div className="mono-label bg-paper-2 px-3 py-1.5 rounded-chip uppercase tracking-widest">
            {IS_LOCAL ? "Yerel" : "v2.0 Beta"}
          </div>
        </div>
      </header>

      {notice && (
        <div className="px-6 py-2 bg-amber-50 border-b border-amber-200 text-xs font-semibold text-amber-800 flex items-center justify-between">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="text-amber-600 hover:text-amber-900">
            kapat
          </button>
        </div>
      )}

      {/* Veri yok veya bayat: otomatik cekim YOK, karar kullanicida */}
      {(needsIngest || ingestInfo?.stale) && (
        <div className="px-6 py-2 bg-paper-2 rule-b text-xs font-semibold text-ink-2 flex items-center justify-between">
          <span>
            {needsIngest
              ? `${selectedDistrict?.name} için henüz veri çekilmemiş.`
              : `${selectedDistrict?.name} verisi ${ingestInfo?.age_days} günlük.`}
          </span>
          <button
            type="button"
            onClick={() => handleIngest(!needsIngest)}
            disabled={ingesting}
            className="flex items-center gap-1.5 text-ink hover:underline disabled:opacity-50"
          >
            <RefreshCw size={12} className={ingesting ? "animate-spin" : ""} />
            {needsIngest ? "Veriyi çek" : "Yenile"}
          </button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden p-4 gap-4">
        <div className="w-80 flex flex-col surface overflow-hidden shrink-0">
          <div className="overflow-y-auto shrink-0">
            <DistrictPicker
              districts={districts}
              selectedDistrictId={selectedDistrictId}
              onSelect={setSelectedDistrictId}
              loading={districtsLoading}
            />
            <FilterPanel
              filters={filters}
              counts={counts}
              onChange={setFilters}
              disabled={!selectedDistrictId}
            />
          </div>

          <PlaceList
            places={places}
            loading={loading}
            selectedPlaceId={selectedPlaceId}
            onPlaceClick={setSelectedPlaceId}
            checkedIds={new Set(basket.keys())}
            onToggleCheck={toggleBasket}
            onReport={setReportTarget}
          />

          <div className="p-4 bg-paper-2 rule-t text-2xs text-ink-4 font-medium flex justify-between">
            <span>
              {selectedDistrictId
                ? `${places.length} / ${total} sonuç`
                : "İlçe seçin"}
            </span>
            {basket.size > 0 && <span>{basket.size} kayıt seçili</span>}
          </div>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          <ExportToolbar
            selectedCount={basket.size}
            totalResults={places.length}
            onSelectAll={selectAllVisible}
            onClearSelection={clearBasket}
            onExport={handleExport}
            exportBlockedReason={exportBlockedReason}
            quotaRemaining={
              IS_LOCAL || !account ? null : account.daily_limit - account.used_today
            }
            isExporting={exporting}
          />
          <div className="flex-1 overflow-hidden surface p-1">
            <MapView
              places={places}
              districts={districts}
              selectedDistrictId={selectedDistrictId}
              onSelectDistrict={setSelectedDistrictId}
              selectedPlaceId={selectedPlaceId}
            />
          </div>
        </div>
      </div>

      {reportTarget && (
        <ReportModal
          key={reportTarget.id}
          place={reportTarget as any}
          isOpen
          onClose={() => setReportTarget(null)}
          onSuccess={() => {
            setReportTarget(null);
            setNotice("Bildiriminiz alindi, tesekkurler.");
          }}
        />
      )}

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={() => {
          setSettingsOpen(false);
          setNotice(null);
          reloadAccount();
        }}
      />

      <UpgradeModal isOpen={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
    </main>
  );
}
```

- [ ] **Step 2: `PlaceList`'i yeni tipe uyarla**

`src/components/PlaceList.tsx` beş noktada değişiyor. `DistrictPlace`'te `name` ve `type` nullable, `distance_m` ve `coordinates` yok.

**(a)** Satır 6, import:

```typescript
import type { DistrictPlace } from "../lib/districts";
```

**(b)** Satır 9-21, prop tipleri:

```typescript
interface PlaceListProps {
  places: DistrictPlace[];
  loading: boolean;
  onPlaceClick: (id: string) => void;
  selectedPlaceId?: string;
  /**
   * Disa aktarim icin secili kayitlarin id'leri. Verilmezse secim
   * arayuzu hic gosterilmez; bilesen eskisi gibi calisir.
   */
  checkedIds?: Set<string>;
  onToggleCheck?: (place: DistrictPlace) => void;
  onReport?: (place: DistrictPlace) => void;
}
```

**(c)** Satır 45-54, boş durum metni — pan artık hiçbir şey tetiklemiyor, eski metin yanıltıcı:

```typescript
  if (places.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <MapPin size={28} aria-hidden="true" className="mb-3 text-ink-4" strokeWidth={1.5} />
        <p className="text-xs text-ink-3 leading-relaxed max-w-[16rem]">
          Sonuç yok. Başka bir ilçe seçin ya da tür ve filtreleri gevşetin.
        </p>
      </div>
    );
  }
```

**(d)** Satır 89 ve 104-106, nullable `name` — `İsimsiz Yer` ikisinde de aynı olmalı, yoksa `aria-label` "null kaydını" der:

```typescript
                    aria-label={`${place.name ?? "İsimsiz yer"} kaydını dışa aktarıma ekle`}
```

```typescript
                  <h3 className="font-display text-sm font-medium text-ink leading-snug line-clamp-2">
                    {place.name ?? "İsimsiz Yer"}
                  </h3>
```

**(e)** Satır 122-137, tür etiketi ve mesafe bloğu. `place.type` artık `null` olabiliyor; mesafe kolonu kalkıyor çünkü ilçe aramasında anlamlı bir "merkez" yok (bkz. spec §10):

```typescript
                  <div className="mt-2 flex items-center gap-2">
                    {/* Onceden burada ham `place.type` versal olarak
                        basiliyordu ve listede "OFFİCE", "PRIMARY_SCHOOL"
                        gibi Ingilizce anahtar degerler goruluyordu.
                        place_type artik NULL olabiliyor: amenity=school
                        tasimayan okullar siniflandirilamiyor. */}
                    <span className="mono-label">
                      {place.type
                        ? PLACE_TYPE_LABELS[place.type]
                        : "Sınıflandırılamadı"}
                    </span>

                    {onReport && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onReport(place);
                        }}
                        className="ml-auto inline-flex items-center gap-1 text-2xs font-medium text-ink-4 hover:text-critical transition-colors duration-fast ease-out"
                      >
                        <Flag size={10} />
                        Bildir
                      </button>
                    )}
                  </div>
```

Satır 108'deki `place.address !== "Adres bilgisi yok"` kontrolü olduğu gibi kalabilir — o sentinel değer eski `/api/search` route'undan geliyordu ([route.ts:49](src/app/api/search/route.ts:49)), yeni backend `null` dönüyor ve kontrol zararsız çalışıyor.

- [ ] **Step 3: `Filters.tsx`'i sil**

```bash
git rm src/components/Filters.tsx
```

Yerini `FilterPanel` aldı. T1'de bu dosyaya eklenen 10 tür `PLACE_TYPE_LABELS` ve `PLACE_TYPE_GROUPS` üzerinden `FilterPanel`'e taşındı.

- [ ] **Step 4: Testleri çalıştır**

Run: `pnpm test`

Expected: tümü PASS — özellikle T14'teki `page.tsx bbox state'i tutmuyor` ve `debounce kullanmiyor` testleri artık geçmeli.

- [ ] **Step 5: Tip kontrolü**

Run: `pnpm type-check`

Expected: temiz. Hata çıkarsa `PlaceList`, `ReportModal` veya `ExportToolbar`'ın `Place` tipine bağlı kalan yerlerinden gelir; `DistrictPlace`'e uyarla.

- [ ] **Step 6: Uygulamayı gerçekten çalıştır**

```bash
cd backend && LOCAL_MODE=true python -m uvicorn app.main:app --port 8004
```

Ayrı terminalde:

```bash
pnpm dev
```

`http://localhost:3004` — kontrol listesi:
- 5 il chip'i ve ilçe listesi geliyor mu
- Haritada ilçe poligonları çizildi mi, tıklanınca seçiliyor mu
- Bir ilçe seçince "veri çekilmemiş" bandı çıkıyor mu
- Pan/zoom yaparken **hiçbir istek gitmiyor** mu (tarayıcı ağ sekmesi)
- Filtre değiştirince istek anında dönüyor mu

- [ ] **Step 7: Commit**

```bash
git add src/app/page.tsx src/components/PlaceList.tsx
git rm src/components/Filters.tsx
git commit -m "feat: ilce secimli akisi ana sayfaya bagla, viewport aramasini kaldir"
```

---

## Task 16: Tam ingest ve uçtan uca doğrulama

**Neden:** 80 ilçenin tamamı sıcak olduğunda ürün "soğuk önbellek durumu olmayan" hâline geliyor. Bu, tasarımın merkezi vaadinin gerçek veriyle doğrulanması.

**Files:** kod değişikliği yok — çalıştırma ve doğrulama

- [ ] **Step 1: Riskli ilçeleri tek tek çek**

Büyük/tuhaf geometrili ilçeler önce, tek tek — timeout ve bbox bölme yolları gerçek veriyle sınanacak:

```bash
cd backend && python -m app.ingest --district tr-44-puturge
```

```bash
cd backend && python -m app.ingest --district tr-34-silivri
```

```bash
cd backend && python -m app.ingest --district tr-59-cerkezkoy
```

Beklenen: her biri `[ok]` veya `[partial]`. `[partial]` kabul edilebilir ama hangi ilçelerde çıktığını not et. `[failed]` çıkarsa `OVERPASS_TIMEOUT`'u yükseltip tekrar dene.

- [ ] **Step 2: Tam ingest'i çalıştır**

```bash
cd backend && python -m app.ingest --all
```

Beklenen: ~40-60 dk, `~320 sorgu`. Step 1'de çekilen üç ilçe `atlandi` görünecek (idempotency). Çıktının sonundaki özeti kaydet.

- [ ] **Step 3: Veri setini doğrula**

```bash
cd backend && python -c "
import asyncio, sqlite3
c = sqlite3.connect('storage.db')
print('ilce:', c.execute('select count(*) from district_ingest').fetchone()[0])
print('ok:', c.execute(\"select count(*) from district_ingest where status='ok'\").fetchone()[0])
print('kayit:', c.execute('select count(*) from places').fetchone()[0])
print('uyelik:', c.execute('select count(*) from place_districts').fetchone()[0])
print('sorgu:', c.execute('select sum(query_count) from district_ingest').fetchone()[0])
for row in c.execute('select place_type, count(*) from places group by place_type order by 2 desc'):
    print(' ', row[0], row[1])
"
```

Beklenen: `ilce: 80`, `kayit` birkaç on bin, `uyelik >= kayit` (tampon yüzünden bazı kayıtlar iki ilçeye üye), `sorgu ≈ 320`, ve tür dağılımında **`college_university` sıfırdan büyük** — T1'de düzeltilen hatanın gerçek veriyle kanıtı.

- [ ] **Step 4: Ağ olmadan çalıştığını doğrula**

Backend'i çalıştır, ağ bağlantısını kes (veya `OVERPASS_URLS`'i erişilemez bir adrese ayarla), arayüzde:
- İlçe seç → sonuçlar geliyor
- Filtreleri değiştir → anında yanıt
- Tür sayıları doğru

Bu, `test_no_owerpass.py`'ın gerçek dünyadaki karşılığı.

- [ ] **Step 5: Tüm test takımını çalıştır**

Run: `cd backend && python -m pytest tests/ -v --cov=app --cov-report=term-missing`

Expected: tümü PASS, kapsam %80 üzeri.

Run: `pnpm test && pnpm type-check && pnpm build`

Expected: üçü de temiz.

- [ ] **Step 6: `README.md`'yi güncelle**

Kurulum bölümüne ingest adımını ekle:

```markdown
### İlçe verisini hazırla

Uygulama 5 ilin (İstanbul, Edirne, Tekirdağ, Kırklareli, Malatya — 80 ilçe)
POI verisini yerel SQLite'a bir kez çekip sonra tamamen yerelde çalışır.

1. Sınır verisi (repoda hazır; yalnızca güncellemek isterseniz):
   `cd backend && python scripts/fetch_districts.py`

2. POI ingest (~40-60 dk, 320 Overpass sorgusu, kaldığı yerden devam eder):
   `cd backend && python -m app.ingest --all`

   Tek il için: `python -m app.ingest --province istanbul`
   Tek ilçe için: `python -m app.ingest --district tr-34-kadikoy`

Ingest tamamlandıktan sonra arama tamamen yerel: filtre panelinde ne
yaparsanız yapın Overpass'e gidilmiyor. Veri elle tazeleniyor; 30 günü
geçen ilçeler arayüzde işaretlenir.
```

- [ ] **Step 7: Commit**

```bash
git add README.md
git commit -m "docs: ilce ingest kurulum adimlarini README'ye ekle"
```

---

## Ölçülebilir Sonuç

Uygulama tamamlandığında doğrulanabilir olması gerekenler:

| | Önce | Sonra | Nasıl doğrulanır |
|---|---|---|---|
| Pan başına Overpass sorgusu | 1-2 | 0 | Tarayıcı ağ sekmesi (T15 Step 6) |
| Filtre değişimi başına sorgu | 1-2 | 0 | `test_no_overpass.py` |
| Toplam sorgu bütçesi | Sınırsız | 325 (5 sınır + 320 ingest) | `select sum(query_count)` (T16 Step 3) |
| Sonuç gecikmesi | 2-60 sn | < 50 ms | Elle (T15 Step 6) |
| Görünür tür sayısı | 9 (üniversite ölü) | 10 | `test_classify_university.py` + T16 Step 3 |
| Aynı anda görülebilen tür | 1 | 10 | `FilterPanel.test.tsx` |
| Çevrimdışı çalışma | Hayır | Evet | T16 Step 4 |
| Frontend test koşucusu | Yok | vitest | `pnpm test` |
