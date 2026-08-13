# Tasarım: İlçe seçimli yerel POI arama

**Tarih:** 2026-08-13
**Durum:** Onay bekliyor

## Amaç

Haritada gezindikçe sürekli Overpass sorgusu atan mevcut davranışı, sonlu ve
önceden doldurulmuş bir yerel veritabanı üzerinde çalışan ilçe seçimli bir
araçla değiştirmek.

Uygulama ticari değil: yerelde çalışan, işyerlerini ve okulları kolay bulmayı
sağlayan bir iç araç. Dolayısıyla tek gerçek kısıt Overpass sorgu maliyeti;
kullanıcı başına kota, plan ve gelir modeli tasarımın dışında.

## Problem

Sorgu maliyeti "çok arama yapıldığı" için değil, **önbelleğin hiç isabet
etmediği** için yükseliyor. Zincir:

1. `MapView.tsx:54` her `moveend`'de bbox yayıyor.
2. `page.tsx:230` 500 ms debounce ile arama tetikliyor.
3. `api/search/route.ts:78` bbox'u merkez + yarıçapa çeviriyor:
   `radius = Math.round(haversine(center, corner))` — ham, yuvarlanmamış metre.
4. `api/search/route.ts:101` önbellek anahtarını `{centerLat, centerLon, radius}`
   üzerinden md5'liyor; **merkez kuantalanmıyor**, 1 piksel pan yeni anahtar.
5. `cache.py:126` merkezi 0.01°'ye (~1.1 km) yuvarluyor ama `radius`'u
   yuvarlamıyor: `r:{radius}`.

Aynı zoom seviyesinde kuzey-güney panlandığında haversine enlemle değiştiği için
`radius` birkaç metre kayıyor, anahtar değişiyor, 12–24 saatlik TTL işlevsiz
kalıyor. Her pan = 1 kota birimi + 1–2 Overpass sorgusu.

### Bu teşhisin bir kısmı sonradan giderildi

Bu spec yazıldıktan sonra `190a158 perf(search): onbellek anahtarini izgaraya
oturt` indi: Next tarafı önbellek anahtarı artık backend'le aynı 0.01°
ızgaraya oturtulmuş kutudan üretiliyor, aynı hücreye düşen panlar önbelleği
paylaşıyor. Commit'in doğrulaması: *pan 1 MISS, pan 2 HIT, pan 3 HIT*.

Yani "önbellek hiç isabet etmiyor" artık doğru değil ve bu tasarımın
gerekçesi daralıyor — ama **ortadan kalkmıyor**, iki sebeple:

1. Izgara isabet oranını iyileştiriyor; ilçe mimarisi sorguyu **sıfırlıyor**.
   Izgarada yeni bir hücreye her geçiş hâlâ bir Overpass turu; ilçede
   ingest'ten sonra hiç tur yok.
2. Izgara "bir ilçedeki bütün fabrika, okul, anaokulu vs." isteğini hiç
   karşılamıyor — o istek tür başına değil ilçe başına veri gerektiriyor.

## Çözümün ekseni

Anahtar uzayını *sürekli* (sınırsız bbox × yarıçap) olmaktan çıkarıp *ayrık* ve
*sonlu* hale getirmek. Ve tür ayrımı zaten `classify.py` tarafından yerel olarak
üretildiği için türü Overpass'e sormak gereksiz iş: bir ilçenin ham verisi bir
kez çekilince 10 türün hepsi o veriden yerel olarak çıkar.

**Anahtar uzayı = 80 ilçe.** Uygulama iki ayrı işe bölünüyor:

| | Ingest | Sorgu |
|---|---|---|
| Bağımlılık | Ağ (Overpass) | Yok, yerel SQLite |
| Sıklık | Tek seferlik + elle tazeleme | Sınırsız |
| Süre | ~40–60 dk (tamamı) | Milisaniye |
| Toplam maliyet | 320 Overpass sorgusu | 0 |

Maliyet artık kullanımla değil veri setinin büyüklüğüyle sınırlı, ve o veri seti
sabit.

## Kapsam

| İl | Plaka | İlçe |
|---|---|---|
| İstanbul | 34 | 39 |
| Malatya | 44 | 13 |
| Tekirdağ | 59 | 11 |
| Edirne | 22 | 9 |
| Kırklareli | 39 | 8 |
| **Toplam** | | **80** |

Bu illerin dışında hiçbir koşulda Overpass sorgusu atılmaz.

İlçe kimliği: `tr-{plaka}-{slug}` — `tr-34-kadikoy`, `tr-22-kesan`,
`tr-44-battalgazi`. Sayılar `fetch_districts.py` tarafından OSM'den doğrulanır;
uyuşmazlık olursa script hata verir (sessizce eksik veri üretmez).

## Ön koşul: taksonomi 10 türe çıkıyor

Mevcut kodda üniversiteler iki bağımsız hatadan dolayı hiç görünmüyor. Yeni panel
tür başına sayı göstereceği için ("Üniversite: 0" her ilçede) bu tasarımın ön
koşulu:

### Hata 1 — ulaşılamayan sınıflandırma dalı

`classify.py:44` `amenity != "school"` ise `None` dönüyor. Üniversiteler oradan
çıkıyor, dolayısıyla `classify.py:88`'deki
`amenity in ["university","college"] -> "college_university"` dalına hiç
ulaşılamıyor. `classify.py:149`'daki `craft`/`workshop` hatasının aynısı.

**Düzeltme:** `amenity in {"university","college"}` kontrolü erken çıkıştan
*önce* gelecek.

### Hata 2 — üniversite hiç sorgulanmıyor

`overpass.py:212` `t_map` içinde `college_keyword -> "school"`. Üniversite
arandığında sorgu yalnızca `amenity=school` çekiyor.

**Düzeltme:** ingest zaten tüm eğitim ailesini (`amenity=university|college`
dahil) çektiği için bu eşleme ingest yolunda kullanılmıyor. Eski
`/api/search` yolundaki eşleme olduğu gibi kalıyor (dokunulmuyor).

### Taksonomi

`classify_school_level` `"college_university"` döndürebiliyor ama bu değer ne
`RADIUS_PRESETS`'te ne frontend `PlaceType` union'ında var. Ekleniyor — Türkiye'de
iki kavram gerçekten ayrı (`classify.py:92`'deki yorum bu ayrımın bilinçli
olduğunu söylüyor):

| Tür | Anlam |
|---|---|
| `factory` | Fabrika / sanayi |
| `office` | Ofis |
| `workshop` | Atölye |
| `kindergarten` | Anaokulu |
| `primary_school` | İlkokul |
| `middle_school` | Ortaokul |
| `high_school` | Lise |
| `private_school` | Özel Okul |
| `college_keyword` | Kolej (özel K-12) |
| `college_university` | **Üniversite / Yüksekokul** (yeni) |

Dokunulacak yerler: `models.py` (`RADIUS_PRESETS`), `src/lib/types.ts`
(`PlaceType`), `src/lib/labels.ts`, `src/components/Filters.tsx`.

### Kapsanmayan etiketleme boşluğu

`building=school` taşıyıp `amenity=school` taşımayan kayıtlar Overpass'ten
geliyor ama `classify_school_level` bunları `None`'a düşürüyor
(`classify.py:44`). Ingest sırasında bu kayıtlar `place_type=NULL` ile
**saklanır ama filtrelerde görünmez**; sorgu endpoint'ine
`include_unclassified=true` verilerek denetlenebilir (veri kalitesini gözden
geçirmek için, normal kullanımda kapalı). Amaç: veriyi atmamak, ama
sınıflandırma kalitesini de uydurmamak.

## 1. İlçe sınırı verisi

Yeni script `backend/scripts/fetch_districts.py` — bir kez elle çalıştırılır,
çıktısı git'e girer:

- 5 ilin `admin_level=6` ilçe relation'larını çeker (5 Overpass sorgusu)
- Poligonları ~0.001° (≈100 m) toleransla basitleştirir
- `backend/app/data/districts.geojson` üretir; her ilçe için:
  `id`, `name`, `province`, `province_plate`, `osm_relation_id`, `bbox`,
  `center`, `geometry` (Polygon veya MultiPolygon)

Basitleştirme toleransı doğruluk kaygısı doğurmuyor: 2 km'lik tampon 100 m'lik
sınır sapmasını yutuyor. Tek basitleştirilmiş kopya hem harita çizimi hem
sunucu filtresi için yeterli.

`shapely>=2.0` bağımlılığı ekleniyor. Adalar gibi çok parçalı ilçeler ve delikli
poligonlar için `MultiPolygon` + hole desteği, ve `shapely.prepared` ile nokta
testi mikrosaniyeye düşüyor. El yazımı ray-casting bu iki durumu doğru
yapabilmek için gereksiz yere karmaşıklaşırdı.

Servis edilmesi:

| Endpoint | Döner | Cache-Control |
|---|---|---|
| `GET /api/districts` | Metadata listesi, poligonsuz (~8 KB) | `max-age=86400` |
| `GET /api/districts/geojson` | Poligonlar (~500 KB–1 MB) | `max-age=604800, immutable` |

Dosya git'te tek yerde durur, frontend'e kopyalanmaz.

## 2. Tampon: ilçe sınırı + 2 km

Overpass'e ilçe bbox'ı + tampon ile gidilir; dönen sonuçlar ilçe poligonunun
2 km tamponlanmış haline göre filtrelenir. Sınırın 500 m dışındaki fabrika
geçerli lead olarak kalır.

Tampon anizotropik ölçek hilesiyle: `lon`'u `1/cos(lat)` ile ölçekle →
`2000/111320` derece `buffer()` → geri ölçekle. Türkiye enlemlerinde
(36–42°, `cos` 0.74–0.81) hata %1'in altında.

`DISTRICT_BUFFER_M=2000` env değişkeni. Tamponlanmış geometri ilçe başına
bellekte memoize edilir.

**Tampon filtre aşamasında uygulandığı için tamponu değiştirmek yeni Overpass
sorgusu gerektirmez** — yalnızca `place_districts` tablosunun yeniden
hesaplanmasını gerektirir (yerel iş, saniyeler).

## 3. Veri modeli

Satır bazlı, çünkü filtre ve sıralama SQL'de yapılacak:

```sql
CREATE TABLE places (
  id            TEXT PRIMARY KEY,   -- osm:node:123
  lat           REAL NOT NULL,
  lon           REAL NOT NULL,
  name          TEXT,
  place_type    TEXT,               -- classify.py çıktısı, NULL = sınıflandırılamadı
  subtype       TEXT,
  confidence    INTEGER,
  has_contact   INTEGER NOT NULL,   -- türetilmiş
  phone         TEXT,
  email         TEXT,
  website       TEXT,
  address       TEXT,
  tags_json     TEXT NOT NULL,
  fetched_at    TIMESTAMP NOT NULL
);

CREATE TABLE place_districts (
  place_id      TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  district_id   TEXT NOT NULL,
  is_inside     INTEGER NOT NULL,   -- 1 = kesin sınır içi, 0 = tampon bölgesi
  PRIMARY KEY (place_id, district_id)
);

CREATE TABLE district_ingest (
  district_id   TEXT PRIMARY KEY,
  fetched_at    TIMESTAMP NOT NULL,
  place_count   INTEGER NOT NULL,
  query_count   INTEGER NOT NULL,
  status        TEXT NOT NULL       -- ok | partial | failed
);

CREATE INDEX idx_pd_district ON place_districts(district_id);
CREATE INDEX idx_places_type ON places(place_type);
CREATE INDEX idx_places_contact ON places(has_contact);
```

`place_districts` ayrı tablo, çünkü 2 km tampon yüzünden sınırdaki bir kayıt iki
ilçeye de ait: Kadıköy'ün içinde *ve* Ataşehir'in tamponunda. Tek `district_id`
kolonu olsa ingest sırası hangisiyse o kazanır ve kayıt sessizce yanlış ilçeye
yazılırdı.

Tamponu 5 ilin dışına taşan kayıtlar (ör. Pütürge'nin 2 km ötesi, Elazığ)
`places`'te saklanır ve komşu kapsanan ilçenin `place_districts` satırını alır;
kesin içi oldukları bir ilçe yoktur.

### `has_contact` tanımı

Şu etiketlerden herhangi biri varsa `1`:
`phone`, `mobile`, `email`, `website`, `contact:phone`, `contact:mobile`,
`contact:email`, `contact:website`.

`fax` dahil değil — saklanır ama ulaşılabilirlik sinyali sayılmaz.

## 4. Ingest

10 türün Overpass seçicilerinin birleşimi 18 selector. Hepsini tek sorguya
koymak büyük ilçelerde (Pütürge ~1100 km², Silivri, Şile) timeout riski
taşıyor, o yüzden **2 aile × 2 aşama = ilçe başına 4 sorgu**:

**B2B ailesi (9 selector):** `man_made=works`, `industrial`,
`building=industrial|warehouse|commercial|office`, `landuse=industrial`,
`office`, `craft`

**Eğitim ailesi (9 selector):** `amenity=kindergarten|school|university|college`,
`building=kindergarten|school|university`, `education=school|university`

**80 ilçe × 4 = 320 Overpass sorgusu, tek seferlik.** 2 eşzamanlı slotla
(Overpass IP limiti) ~40–60 dk.

Mevcut 2 aşamalı orkestrasyon korunuyor ama **eşik kalkıyor**: ingest sırasında
Stage 2 (isimsiz kayıtlar) her zaman çalışır. `MIN_STAGE1_B2B=30` /
`MIN_STAGE1_SCHOOL=20` eşikleri sıcak yolda fazladan sorgudan kaçınmak içindi;
tek seferlik ingest'te bu kaygı yok ve tam veri daha değerli.
`is_valid_unnamed` son-filtresi olduğu gibi kalıyor.

Timeout alan ilçenin bbox'ı dörde bölünüp tekrar denenir; hâlâ başarısızsa
`district_ingest.status = 'partial'` yazılır ve arayüzde işaretlenir.

```bash
python -m app.ingest --all                    # 5 il, ~45 dk
python -m app.ingest --province istanbul
python -m app.ingest --district tr-34-kadikoy
python -m app.ingest --all --force            # tazelemeyi zorla
```

Idempotent ve kaldığı yerden devam eder: `district_ingest` tablosunda taze
kaydı olan ilçeyi atlar. İlerleme logu: `[INGEST] 43/80 tr-34-kadikoy 4 sorgu 18.2s 412 kayıt`.

**Talep üzerine ingest:** haritada henüz çekilmemiş bir ilçeye tıklanırsa o an
çekilir (~30 sn, bir kez), sonrası anında. Arayüz bu bekleyişi açıkça gösterir.

`warmup.py` kaldırılıyor — `ingest.py` onun yerini alıyor ve işini gerçekten
yapıyor. Eski servis 5 şehir merkezinin 5 km çevresini ısıtıyordu, yani anahtar
uzayının küçük ve rastgele bir dilimini; ayrıca her container recreate'te 20
eşzamanlı sorgu atıp Overpass kotasını tüketiyordu (`warmup.py:22`'deki yorum
bunu anlatıyor). Ingest startup'ta **hiç** çalışmaz.

## 5. Sorgu API'si

Hiçbiri Overpass'e gitmez; ağ yoksa da çalışır.

```
GET /api/districts/{district_id}/places
    ?types=factory,office,kindergarten     # çoklu, boş = hepsi
    &has_contact=true
    &named_only=true
    &min_confidence=40
    &q=metin                               # isim içinde arama
    &include_buffer=true                   # false = yalnızca is_inside=1
    &include_unclassified=false            # place_type IS NULL kayıtları
    &sort=lead_score|contact_first|confidence|name|ref_distance
    &ref_lat=&ref_lon=                     # sort=ref_distance için
    &limit=&offset=
```

Varsayılanlar: `types` boş (hepsi), `has_contact=false` (filtre yok),
`named_only=false`, `min_confidence=0`, `include_buffer=true` (2 km tampon
kullanıcının açık talebi), `include_unclassified=false`,
`sort=contact_first`, `limit=500`, `offset=0`.

```
GET /api/districts/{district_id}/summary
```
→ tür başına sayım: `{factory: 34, office: 121, kindergarten: 12, ...}` +
`fetched_at` + `status`. "Bu ilçede ne var?" sorusunun tek istekli cevabı ve tür
chip'lerindeki sayıları besler.

Filtre → SQL çevirisi `app/queries.py` içinde izole; parametreli sorgu
(string birleştirme yok).

Frontend'e Next.js proxy route'ları üzerinden ulaşılır —
`src/app/api/districts/[...path]/route.ts`, mevcut
`src/app/api/admin/[...path]/route.ts` desenini takip eder.

## 6. Arayüz

`onBoundsChange` tamamen kaldırılıyor. `page.tsx`'teki `bbox` state'i yerini
`selectedDistrictId`'ye bırakıyor. Pan/zoom hiçbir şey tetiklemez.

Kenar çubuğu üç bloğa ayrılıyor:

**Konum** — 5 il chip'i + aranabilir ilçe combobox'ı (80 ilçe içinde
"Pehlivanköy"ü haritada gözle bulmak zor; yazmak iki saniye). Haritadaki
poligonlar da tıklanabilir seçici; ikisi tek state'e bağlı.

**Tür** — 10 chip **çoklu seçim**, her birinin yanında o ilçedeki sayı
(`Fabrika 34`, `Anaokulu 12`). "Tümü" / "Temizle" kısayolları. Sayısı 0 olan tür
soluk görünür ama tıklanabilir kalır.

**Filtre & Sıralama** — sıralama seçici (5 seçenek), `Sadece iletişim bilgisi
olanlar`, `Sadece isimli kayıtlar`, min güven kaydırıcısı, isim arama kutusu,
`Tampon bölgeyi dahil et` anahtarı.

Haritada:
- İlçe poligonları katmanı: seçilmemiş ince kontur, hover vurgulu, seçili dolgulu
- Seçim sonrası `fitBounds` ilçe bbox'ına
- Türe göre marker rengi + lejant (çoklu seçim olduğu için şart)
- Viewport'ta kapsanan ilçe yoksa sessiz bant: "Kapsam: İstanbul, Edirne,
  Tekirdağ, Kırklareli, Malatya". Sorgu atılmaz, hata verilmez.

Her filtre değişimi **debounce'suz, anında** — SQL yerel. Mevcut 500 ms debounce
(`page.tsx:230`) kalkıyor. `slowSearch` bandı ve `radiusClamped` bildirimi de
kalkıyor (ikisi de Overpass gecikmesine dair, artık yok); yalnızca talep üzerine
ingest sırasında bir ilerleme göstergesi kalıyor.

Export dosya adı ilçeyi taşır. Tür çoklu seçim olduğu için: tek tür seçiliyse
`leads_kadikoy_factory.csv`, iki veya üç türde birleştirilir
(`leads_kadikoy_factory-office.csv`), daha fazlasında sayıya düşer
(`leads_kadikoy_5-tur.csv`) — 10 türün adını dosya adına dizmemek için.

### Tazelik hatırlatması

Otomatik tazeleme yok. Bir ilçenin `fetched_at`'i 30 günü geçerse arayüzde
bilgilendirme çıkar: "Bu ilçenin verisi 47 günlük. Yenile?" — düğmeye basılırsa
o ilçe için 4 sorgu atılır. Karar kullanıcıda, ama veri sessizce çürümez.

## 7. `LOCAL_MODE`

Kota/plan sistemi tamamen ticari amaçlı: `free`/`pro`/`enterprise`,
`daily_limit`, `used_today`, `UpgradeModal`, export kilidi. Yerel bir araçta
bunlar sürtünme — kullanıcı arama yapabilmek için admin endpoint'inden anahtar
üretmek zorunda kalıyor.

`LOCAL_MODE=true` (yerel `.env` varsayılanı):

- `verify_api_key` / `validate_api_key` baypas edilir
- Kota sayacı işletilmez
- Export serbest, `exportBlockedReason` her zaman `null`
- `UpgradeModal` hiç açılmaz

**Kod silinmiyor, bayrakla kapanıyor.** `LOCAL_MODE=false` ile mevcut davranış
aynen geri gelir; `expo-osm-map` ve eski `/api/search` yolu etkilenmez.

## 8. Kapsam dışında bırakılanlar

- Eski `GET /api/search` (yarıçap tabanlı) **dokunulmuyor** — `expo-osm-map`
  istemcisi ve mevcut testler ona bağlı
- `admin` router, override sistemi, rapor akışı — değişmiyor
- Kota/plan kodunun silinmesi — yalnızca bayrakla kapatılıyor
- 5 il dışına genişleme — `fetch_districts.py` konfigürasyonuna il eklemek
  yeterli, ama bu tasarımın parçası değil

## 9. Dosya organizasyonu

**Backend (yeni)**
| Dosya | Sorumluluk |
|---|---|
| `app/districts.py` | GeoJSON yükleme, tampon, nokta→ilçe testi |
| `app/store.py` | `places` / `place_districts` yazma-okuma |
| `app/queries.py` | Filtre+sıralama → parametreli SQL |
| `app/ingest.py` | CLI, aile/aşama orkestrasyonu, idempotency |
| `app/routers/districts.py` | 4 endpoint |
| `scripts/fetch_districts.py` | Sınır verisi üretimi (tek seferlik) |

**Backend (silinen):** `app/services/warmup.py`

**Frontend (yeni)**
| Dosya | Sorumluluk |
|---|---|
| `lib/districts.ts` | Metadata + GeoJSON çekme, istemci önbelleği |
| `components/DistrictPicker.tsx` | İl chip'leri + ilçe combobox |
| `components/DistrictLayer.tsx` | Leaflet GeoJSON katmanı |
| `components/FilterPanel.tsx` | Sıralama + filtre kontrolleri |
| `hooks/useDistrictPlaces.ts` | Sorgu state'i |

`page.tsx` şu an 355 satır; ilçe + filtre state'i eklenince şişerdi. Yukarıdaki
bölünmeyle sorumluluk `page.tsx`'ten çıkıyor.

## 10. Kullanıcıya bırakılan karar: `lead_score`

Sıralama panelde kullanıcı kontrolünde, ama seçeneklerden biri bir formül ve o
formül sahadaki deneyime dair bir yargı. `app/queries.py` içinde çevresi
hazırlanıp imza kullanıcıya bırakılacak:

```python
def lead_score(place: PlaceRow) -> int:
    """Outreach için 'bu kaydı ne kadar önemsemeliyim' skoru (0-100).
    Panelde 'Lead kalitesi' sıralamasını besler.

    Sinyaller: phone, email, website, name (varlığı ve jenerikliği),
    confidence, place_type, tags (operator, brand, opening_hours).

    TODO(kullanıcı): ağırlıkları belirle. Telefonu olan isimsiz bir
    fabrika mı, telefonu olmayan isimli bir okul mu daha değerli?
    """
```

Asıl soru: **ulaşılabilirlik mi (telefon/mail) yoksa kimlik netliği mi
(isim/güven) daha ağır basar?** Uygulama aşamasında kararlaştırılacak.

## 11. Uygulama sırası

Parçalar birbirine bağlı; bu sıra bağımlılıkları takip ediyor ve her aşama
kendi başına doğrulanabiliyor:

| # | Aşama | Bitince neyi doğrulayabiliriz |
|---|---|---|
| 1 | ✅ **TAMAMLANDI** (`290d098`) — taksonomi düzeltmesi (10 tür) | `test_university_taxonomy.py` yeşil; ingest doğru tür atayabilir |
| 2 | `fetch_districts.py` + `districts.geojson` + `app/districts.py` | 80 ilçe geldi mi, nokta→ilçe testi doğru mu |
| 3 | Tablolar + `app/store.py` + `app/ingest.py` | Tek ilçe CLI ile çekilebiliyor, idempotent |
| 4 | `app/queries.py` + `app/routers/districts.py` | Filtreler curl ile doğrulanabiliyor, Overpass'e gidilmiyor |
| 5 | `LOCAL_MODE` | Anahtarsız erişim çalışıyor |
| 6 | Arayüz (5 komponent + `page.tsx` sadeleştirmesi) | Uçtan uca kullanım |
| 7 | Tam ingest (`--all`, ~45 dk) | 80 ilçenin tamamı sıcak |

Aşama 1 ön koşul: ingest sınıflandırmaya dayandığı için hatalı taksonomiyle
çekilen veri yeniden çekilmek zorunda kalır.

## 12. Doğrulama planı

### Backend testleri

| Dosya | Kapsam |
|---|---|
| `test_districts_geo.py` | Nokta→ilçe: Adalar (MultiPolygon), poligon deliği içi, sınıra 1 km / 3 km noktalar, tampon anizotropisi |
| `test_district_membership.py` | Sınır POI'sinin iki ilçeye de üye olması; `is_inside` doğruluğu; 5 il dışına taşan tampon kaydı |
| `test_ingest.py` | Idempotency (ikinci çalıştırma 0 sorgu), yarıda kesilip devam etme, timeout→bbox dörde bölme, `status='partial'` |
| `test_queries.py` | Her filtre kombinasyonu → doğru SQL + doğru sonuç kümesi; parametreli sorgu (injection yok) |
| `test_classify_university.py` | `amenity=university` → `college_university` (regresyon: ulaşılamayan dal) |
| `test_local_mode.py` | `LOCAL_MODE=true` anahtarsız erişim; `false` ile mevcut 401 davranışı |
| `test_no_overpass.py` | **Ingest edilmiş bir ilçe için sorgu endpoint'lerinin Overpass'e hiç gitmediğini kilitler** (`overpass_client.query` mock'lanır, çağrılmadığı doğrulanır) |

`test_no_overpass.py` bu tasarımın merkezi vaadini test eden dosya: filtre
paneliyle oynamak sorgu maliyeti doğurmaz. Kapsam **ingest edilmiş** ilçe —
talep üzerine ingest (§4) tanımı gereği Overpass'e gider, o ayrı bir testin
konusu (`test_ingest.py`).

### Frontend testleri

- `DistrictPicker`: il değişince ilçe listesi güncelleniyor, arama filtreliyor
- `FilterPanel`: çoklu tür seçimi, "Tümü"/"Temizle"
- **Regresyon:** `MapView` artık `onBoundsChange` almıyor; pan arama tetiklemiyor

### Mevcut testler

Tamamı yeşil kalmalı. `/api/search` dokunulmadığı için `test_api.py`,
`test_ref_distance.py`, `test_pagination.py`, `test_classify.py` etkilenmez.

### Elle doğrulama

```bash
python -m app.ingest --district tr-59-cerkezkoy   # sanayi yoğun ilçe
python -m app.ingest --district tr-34-adalar      # MultiPolygon
python -m app.ingest --district tr-44-puturge     # büyük alan, timeout riski
```

Ardından arayüzde: tür sayımları dolu geliyor mu, "Üniversite" sıfır değil mi,
filtreler anında yanıt veriyor mu, ağ kapatıldığında sorgular çalışıyor mu.

## 13. Ölçülebilir sonuç

| | Önce | Sonra |
|---|---|---|
| Pan başına Overpass sorgusu | 1–2 | 0 |
| Filtre değişimi başına sorgu | 1–2 | 0 |
| Toplam sorgu bütçesi | Sınırsız (kullanımla artar) | 320 + elle tazeleme (kullanımdan bağımsız) |
| Önbellek isabet oranı (pan) | ~0 | Yok — sorgu yok |
| Sonuç gecikmesi | 2–60 sn | < 50 ms |
| Görünür tür sayısı | 9 (üniversite ölü) | 10 |
| Aynı anda görülebilen tür | 1 | 10 |
| Çevrimdışı çalışma | Hayır | Evet (ingest sonrası) |
