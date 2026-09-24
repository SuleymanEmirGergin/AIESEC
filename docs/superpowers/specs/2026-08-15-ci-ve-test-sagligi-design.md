# Tasarım: CI + test sağlığı (T15'in kapatılması)

**Tarih:** 2026-08-15
**Durum:** Onaylandı
**Yol haritası:** `2026-08-15-dort-paket-yol-haritasi.md` — Paket 1

## Amaç

İki iş, tek pakette:

1. Depoya sürekli tümleştirme kurmak — testler, tip kontrolü ve lint her
   PR'da otomatik koşsun.
2. `src/lib/districts.test.ts` içindeki 13 atlanan ve 3 kırık testi tek
   tek karara bağlamak.

İkisi aynı pakette, çünkü ayrı olurlarsa CI ilk günden kırmızı başlar ve
kırmızı CI'a alışılır.

## Problem

### CI yok

`.github` dizini yok. 300 backend testi var ve hiçbiri otomatik
koşmuyor. Depo public, PR akışı gerçekten kullanılıyor (5 PR açılmış,
2'si merge edilmiş, 3'ü şu an açık) — yani denetlenecek iş zaten
birikmiş durumda.

### Test dosyası aslında bir devir teslim notu

`src/lib/districts.test.ts` bir test paketi gibi görünüyor ama değil.
Dosyanın başındaki nottan (satır 4-20) anlaşılıyor: yazıldığı sırada
`districts.ts` başka bir oturumun elindeymiş, brief'in beklediği
isimler henüz ihraç edilmiyormuş, ve hizalama **Task 15**'e
bırakılmış. T15 hiç koşulmamış.

Sonuç, `pnpm test` çıktısında şöyle görünüyor:

```
Tests  3 failed | 3 passed | 13 skipped (19)
```

13 test `describe.skipIf(!X)` ile sarılı; `X` ihraç edilmediği için
`undefined`, dolayısıyla o bloklar **asla koşmayacak**. Bu bir kapsam
yanılsaması: test yazılmış görünüyor, koşmuyor.

## Yaklaşım

CI için üç seçenek değerlendirildi:

| | Yaklaşım | Artı | Eksi |
|---|---|---|---|
| **A** | Tek workflow, iki paralel job, path filtresi yok | ~3 dk; her PR'da her şey koşar | Backend'e dokunmayan PR'da da backend koşar |
| B | İki workflow + `paths:` filtresi | Daha az koşu | Sözleşme kaymasını kaçırır |
| C | Tek job, sıralı | En basit yapılandırma | Geri bildirim yavaş |

**A seçildi.** Gerekçe bu projeye özel: sözleşme kayması burada zaten
bir kez yaşandı — commit `7ec0026` ("ilçe endpoint sözleşmesini brief'e
getir") backend'in değişip frontend'in geride kalmasıydı, ve bu spec'in
ayıkladığı testler onun enkazı. Path filtresi tekrarında bunu görmeyen
tek tasarım. Depo public olduğu için Actions dakikası ücretsiz; B'nin
tasarruf ettiği şeyin bedeli yok.

## Tasarım

### CI mimarisi

Tek dosya: `.github/workflows/ci.yml`.

**Tetikleyici:** `pull_request` (tüm hedef dallar) + `push` (yalnız `main`).

**Job `backend`** — `ubuntu-latest`, Python 3.12, `backend/` çalışma dizini:

1. `pip install -r requirements.txt`
2. `ruff check .`
3. `pytest --cov --cov-fail-under=79`

Ruff, pytest ve coverage yapılandırmaları `backend/pyproject.toml`
içinde zaten hazır; CI yeni yapılandırma getirmiyor, mevcudu çağırıyor.

**Job `frontend`** — `ubuntu-latest`, Node 20, pnpm 8.15.4:

1. `pnpm install --frozen-lockfile`
2. `pnpm type-check`
3. `pnpm lint`
4. `pnpm test`

pnpm sürümü `package.json`'daki `packageManager` alanından okunur;
ikinci bir yerde sürüm sabitlemek iki doğruluk kaynağı yaratırdı.

İki job paralel koşar.

#### ESLint yapılandırması önce oluşturulmalı

Depoda **hiçbir ESLint yapılandırması yok** — ne `.eslintrc*`, ne
`eslint.config.*`, ne de `package.json` içinde `eslintConfig`. `next lint`
yapılandırma bulamadığında etkileşimli kurulum sorusu soruyor; CI'da TTY
olmadığı için adım orada takılır veya düşer. Dolayısıyla
`.eslintrc.json` (`{"extends": "next/core-web-vitals"}`) bu paketin
teslimatlarından biri.

Getireceği temizlik borcu ölçüldü: aynı yapılandırmayla `src/**/*.{ts,tsx}`
üzerinde **0 hata, 1 uyarı**. Tek uyarı `src/app/layout.tsx:50`'deki
`@next/next/no-page-custom-font` ve App Router'da tartışmalı — kural
`pages/_document.js`'i hedefliyor. Uyarı bırakılıyor, lint varsayılan
davranışıyla (uyarılar başarısızlık saymaz) koşuyor. `--max-warnings=0`
kurmak bu tek uyarı için kural bastırmayı gerektirirdi; kazancı yok.

### Dış bağımlılık yok

Backend testleri ağa çıkmıyor. `backend/tests/conftest.py`:

- Overpass'i `overpass_stub` ile taklit ediyor (satır 89),
- ayrı bir `test_storage.db` kullanıyor (satır 14),
- kimlik doğrulamayı `dependency_overrides` ile devre dışı bırakıyor
  (satır 66).

Dolayısıyla CI'da ek servis, secret veya Redis kurulumu gerekmiyor.

### Kapsam ciriti

`--cov-fail-under=79`. Bugünkü değer %79,07; eşik bunun hemen altına
kurulur. Kapsam düşerse PR kırmızıya döner. Yükseldikçe eşik elle yukarı
çekilir ve bu bir commit olarak görünür — böylece kapsamdaki her kazanım
kayda geçer.

Geçmişi cezalandırmayan, geri gidişi engelleyen bir kural.

Frontend'e eşik konmuyor — **ölçüm de kurulmuyor.** Depoda vitest
kapsam sağlayıcısı (`@vitest/coverage-v8`) yüklü değil; eklemek yeni bir
bağımlılık ve yeni bir yapılandırma demek. Frontend kapsamı, ilk gerçek
test kütlesinin oluşacağı paket 2 ile birlikte ele alınır. Bu paketin
frontend tarafındaki ölçütü kapsam değil, `skipped` sayısının sıfıra
inmesi.

### Test ayıklaması (T15)

Her test "bugün birini engelliyor mu" sınavından geçirildi.

| Test bloğu | Sayı | Karar | Gerekçe |
|---|---:|---|---|
| `buildPlacesParams` | 9 | **Karşıla** | Dokuz testin dokuzu da bugünkü davranışı tarif ediyor (aşağıya bakın) |
| `PROVINCES` | 2 | **Sil** | İkinci doğruluk kaynağı yaratır, üstelik iddiası paket 4'te yanlışa döner |
| `triggerDistrictIngest` | 2 | **Sil, paket 4'e taşı** | Arayüz özelliği yok; testin varsaydığı senkron sözleşme gerçeklikle uyuşmuyor |
| `fetchDistricts` hata mesajı | 1 kırık | **Testi düzelt** | Modül önbelleği kasıtlı bir özellik; test sıra bağımlılığından kırılıyor |
| İlçe kimliği URL kaçırma | 1 kırık | **Kodu düzelt** | Gerçek eksik |
| Abort sinyali | 1 kırık | **Testi düzelt** | Shipped imza daha tutarlı; test eski brief imzasını varsayıyor |

Sonuç: dosyada `skipIf` kalmıyor. Her test ya koşuyor, ya da gerekçesi
commit mesajında yazılı olarak siliniyor.

#### Neden `buildPlacesParams` karşılanıyor

Dokuz testin beklentileri `districts.ts:150-169`'daki `buildQuery` ile
tek tek karşılaştırıldı:

| Test | Mevcut kod |
|---|---|
| boş sorgu boş parametre üretir | `params` boş, `toString()` → `""` |
| türleri virgülle birleştirir | satır 153 |
| boş tür dizisi parametre eklemez | `query.types?.length` falsy |
| `false` değerleri göndermez | `if (query.hasContact)` |
| `true` değerleri gönderir | satır 154-155 |
| `includeBuffer` yalnızca `false` ise gönderilir | satır 159 |
| sıfır `minConfidence` göndermez | `if (query.minConfidence)`, 0 falsy |
| boş metin araması göndermez | `query.q?.trim()`, kırpılmış değeri yazar |
| sıralama ve sayfalama geçer | satır 161-165 |

Dokuzu da eşleşiyor. Yani **davranış değişikliği gerekmiyor**;
`buildQuery` dışa açılıp dönüş tipi `URLSearchParams` yapılınca dokuz
test de kazanılıyor. Testler kodu karşılamıyor değil — kod testleri
zaten karşılıyor, sadece ikisi tanıştırılmamış.

#### Neden `PROVINCES` siliniyor

Frontend il listesini sunucudan türetiyor: `fetchDistricts()` ile ilçe
listesi geliyor, `groupByProvince()` (satır 131) illere ayırıyor. Ayrı
bir sabit liste ikinci bir doğruluk kaynağı olurdu — backend'e il
eklendiğinde frontend sabitini güncellemeyi unutmak bir hata sınıfı
yaratır.

Dahası testin kendi iddiası (`PROVINCES` beş il içerir, plakalar
`22,34,39,44,59`) **paket 4 il eklediği anda yanlışa döner.** Yani test
yalnızca gereksiz değil, sıradaki paketi aktif olarak engelliyor.

Test dosyasındaki kendi notu da bunu söylüyor: "eski sözleşme, backend
7ec0026 ile ayrıştı."

#### Neden `triggerDistrictIngest` siliniyor ve devrediliyor

İstemci sarmalayıcısı yazılmamış, çünkü karşılığı olan arayüz özelliği
yok. Bugün gönüllü çekilmemiş bir ilçe seçtiğinde `src/app/page.tsx:458`
dürüst davranıyor: "veri çekilmemiş, haritadan tarayabilirsiniz."

Testi karşılamak bir ürün özelliği eklemek demek olurdu — kuyruğun
köpeği sallaması. Üstelik testin varsaydığı sözleşme gerçekçi değil:
`{ place_count, status, skipped }` senkron bir cevap bekliyor, oysa
ingest ilçe başına 3-20 dakika sürüyor (README, "Bilinen sınırlar").
Tarayıcıdan tetiklenen senkron bir çağrı olamaz; arka plan işi ve durum
takibi gerekir.

Bu, paket 4'ün asıl tasarım konusu. Test siliniyor, soru yol
haritasında paket 4'ün açık sorusu olarak kayıt altına alınıyor.

#### Neden `fetchDistricts` testi düzeltiliyor, kod değil

Test, `fetchDistricts`'in her çağrıda taze istek atmasını varsayıyor.
Shipped kod ise modül seviyesinde önbellekliyor (`districtsPromise`,
satır 99). Bu önbellek **kasıtlı ve doğru**: satır 103-105'te gerekçesi
yazılı ("iki bileşen aynı anda isterse tek istek gidiyor"), ve hata
durumunda kendini temizliyor (satır 112) — yani kalıcı hataya dönüşmüyor.

Test, aynı dosyada önce başarılı bir çağrı koştuğu için önbelleğe
takılıyor. Düzeltme testte: `vi.resetModules()` ve dinamik import ile
her senaryo temiz modül durumuyla koşar. Test sırasına bağımlı bir
geçiş, gerçek davranışı gizlerdi.

#### Neden abort testi düzeltiliyor

Shipped imza `(districtId, query, signal?: AbortSignal)`. Test brief'in
eski imzasını (`init?: RequestInit`) varsayıp `{ signal }` geçiyor, bu
da `fetch`'e sarılmış halde ulaşıyor.

Shipped imza tercih ediliyor: daha basit ve `fetchDistrictSummary` ile
tutarlı (satır 185). İki fonksiyonun aynı konumdaki parametresi farklı
şekil almamalı. Test imzaya uyarlanıyor.

### Kod değişiklikleri

Yeni dosyalar: `.github/workflows/ci.yml` ve `.eslintrc.json`.

Mevcut kaynak kodunda değişen tek dosya `src/lib/districts.ts`:

1. `buildQuery` → `export function buildPlacesParams(query: PlaceQuery): URLSearchParams`.
   Çağıran taraf `.toString()` ile sarar ve boşsa `?` eklemez.
2. `fetchDistrictPlaces` ve `fetchDistrictSummary` içinde
   `encodeURIComponent(districtId)`. İkisinde de eksik; testi olan
   yalnızca birincisi ama aynı hata ikisinde de düzeltilir.
3. Satır 194-205'teki öksüz doküman bloğu `foldTr`'yi anlatıyor ama
   `districtPlaceToPlace`'in üstünde duruyor. Sahibinin yanına taşınır.

Üçüncü madde dosyanın zaten açılıyor olmasından yararlanan bir
düzeltme; ayrı bir iş olarak açılmayı hak etmiyor ama okuyanı yanılttığı
için bırakılmıyor.

### Yeni testler

Ciriti yukarı çekmek ve paket 2'yi hazırlamak için:

**`backend/tests/test_saved_places.py` genişletilir.** Hedef
`app/routers/saved.py` (%46,15) — paket 2'nin ineceği yer. Kapsanacak
davranışlar, ikisi de README'de bilinçli kural olarak belgeli:

- liste silmek içindeki yerleri silmez, dosyalanmamışa düşürür,
- bir yer takım başına bir kez kaydedilir, listeler arasında taşınır,
- aynı yeri iki kez kaydetmek hata değil, mevcut kaydı döndürür.

**`src/lib/savedApi.test.ts` yeni dosya.** Frontend'in ikinci test
dosyası olur:

- hata yolu (`response.ok` false iken mesajın fırlatılması),
- `savedToPlace` dönüşümü,
- `X-API-KEY` başlığının anahtar varken eklenip yokken eklenmemesi.

### Hata yönetimi

CI kırmızıya döndüğünde davranış: PR birleştirilmez, sebep job
çıktısında görünür. Kapsam ciriti tetiklenirse mesaj hangi dosyanın
gerilediğini gösterir (`--cov-report=term-missing` zaten
`pyproject.toml`'da açık).

Bu spec **branch protection ayarını kapsamıyor** — o bir depo ayarı,
kod değil. CI birkaç PR'da yeşil koştuktan sonra ayrıca önerilir.

## Kapsam dışı

Bilerek dışarıda bırakılanlar:

- E2E / Playwright testleri
- Bileşen testleri (`page.tsx`, `MapView.tsx` vb.)
- Docker imajı build'i CI'da
- Deploy / release otomasyonu
- Branch protection ayarı
- Depo temizliği (`verify_*.py`, log dosyaları)
- Frontend kapsam eşiği

Bunların her biri paketi şişirir ve CI'ın ilk yeşil koşusunu geciktirir.

## Başarı ölçütü

1. `.github/workflows/ci.yml` var; açık üç PR'da da koşuyor.
2. `.eslintrc.json` var ve `pnpm lint` etkileşimli soru sormadan,
   yapılandırma kurulumu istemeden tamamlanıyor.
3. `pnpm test` çıktısında `skipped` sayısı **0**.
4. `pnpm test` ve `pytest` yeşil.
5. `pytest --cov` %79'un altına düşmüyor.
6. `districts.test.ts` içinde "T15" ve "BULGU" notlarının işaret ettiği
   her madde ya karşılanmış ya da gerekçesiyle silinmiş.
