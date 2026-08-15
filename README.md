# POI Finder

AIESEC gönüllülerinin staj ve değişim programları için **ortak kurum**
bulmasına yarayan harita aracı: bir bölgedeki okulları, fabrikaları,
ofisleri ve atölyeleri iletişim bilgileriyle birlikte bulur, adlandırılmış
listelere kaydeder, CSV olarak dışa aktarır.

Kimin için tasarlandığı ve hangi kısıtların neden konduğu
[`PRODUCT.md`](PRODUCT.md) içinde; görsel sistem [`design.md`](design.md)
içinde. Tasarımla ilgili bir karar vermeden önce ikisini okuyun.

## Nasıl çalışıyor

```
tarayıcı → Next.js (proxy + önbellek) → FastAPI → ┬ Overpass API   (harita taraması)
                                                  └ yerel SQLite   (ilçe sorgusu)
                                                        ↑
                                    veriyi dolduran iki kaynak:
                                    · Overpass / OSM     → app.ingest
                                    · Overture Maps (S3) → /enrich
```

İki arama yolu var:

| Yol | Ne zaman | Kaynak | Hız |
|---|---|---|---|
| **Harita taraması** | İlçe seçilmemişken | Overpass API (canlı OSM) | Yavaş — soğuk önbellekte dakikayı bulabilir |
| **İlçe sorgusu** | İlçe seçilince | Yerel SQLite (önceden çekilmiş) | Hızlı — ağ beklemesi yok |

Yerel veritabanı **iki kaynaktan** besleniyor. OSM'de iletişim bilgisi
seyrek (telefon %9,2); Overture Maps aynı bölgelerde çok daha dolu
(%78,5) ve places teması OSM materyalini dışladığı için çakışmıyor.
Kaynak seçimi lisansa göre yapıldı — ayrıntısı aşağıda "İlçe verisi".

Tarayıcı backend'e doğrudan gitmez. Tüm istekler Next.js route'larından
geçer; API anahtarı orada eklenir ve istemciye hiç ulaşmaz.

## Ekranlar

| Route | Ne yapar |
|---|---|
| `/` | Harita + il/ilçe seçimi, kategori filtresi (çoklu seçim, sayılı), filtre paneli, sayfalanan sonuç listesi, kaydetme |
| `/kayitli` | Kaydedilen yerler, adlandırılmış listeler, not alanı, CSV indirme, indirme geçmişi |
| `/admin` | Yönetici paneli: hata raporları, özet sayılar |
| `/admin/overrides` | OSM sınıflandırma düzeltmeleri |

`/admin` ayrı bir anahtarla korunur (`ADMIN_API_KEY`), plana bağlı değildir.

## Hızlı başlangıç

**Gereksinimler:** Node.js 18.17+, pnpm 8+, Docker (backend ve Redis için),
Python 3.12 (backend'i yerelde çalıştıracaksanız).

Geliştirme için en iyisi hibrit: backend ve Redis container'da, frontend
hot-reload'lu.

```bash
docker compose up -d backend redis
pnpm install
pnpm dev
```

Frontend [http://localhost:3004](http://localhost:3004), backend
[http://localhost:8004](http://localhost:8004).

Tam yığını container'da çalıştırmak için:

```bash
docker compose up -d --build
```

> Docker ağında servisler birbirine **servis adı ve iç portla** erişir
> (`backend:8000`, `redis:6379`) — `localhost` ile değil. Host'a açılan
> 3004/8004 yalnızca dışarıdan erişim içindir.

## Ortam değişkenleri

Frontend (`.env.local`, örnek için `.env.local.example`):

| Değişken | Zorunlu | Ne işe yarar |
|---|---|---|
| `NEXT_PUBLIC_API_BASE` | evet | Backend kökü, ör. `http://localhost:8004/api` |
| `SEARCH_API_KEY` | evet | Sunucu tarafı anahtar. Kullanıcı kendi anahtarını girmediğinde bu kullanılır; **son kullanıcı anahtar girmeden çalışabilsin diye vardır** |
| `REDIS_URL` | hayır | Yoksa önbellek sessizce devre dışı kalır |
| `NEXT_PUBLIC_APP_VERSION` | hayır | Hata raporlarına eklenen sürüm etiketi (varsayılan `2.0.0`) |

Backend (`backend/.env`):

| Değişken | Ne işe yarar |
|---|---|
| `ADMIN_API_KEY` | `/admin` uçlarının anahtarı |
| `DATABASE_URL` | Varsayılan SQLite. Docker'da `/app/data/storage.db` (volume) |
| `OVERPASS_URLS` | Virgülle ayrılmış ayna listesi; failover buna göre. **Cevap vermeyen aynayı listede tutmayın**: yedeklilik sağlamaz, yalnızca deneme başına 20-40 sn yer |
| `OVERPASS_TIMEOUT` | Hem HTTP zaman aşımı hem sorguya gömülen `[out:json][timeout:N]` |
| `OVERPASS_COOLDOWN_BASE` | Başarısız aynanın ilk bank süresi (sn, varsayılan 15). Üst üste hatalarda katlanarak uzar |
| `OVERPASS_COOLDOWN_MAX` | Bank süresi tavanı (sn, varsayılan 300) |
| `OVERPASS_PROVEN_FAIL_LIMIT` | Bir kez çalışmış ayna kaç ardışık hataya kadar öncelikli sayılır (varsayılan 3) |
| `OVERTURE_RELEASE` | Overture sürümü (varsayılan `2026-07-22.0`). Sabit tutulur: "latest" yolu yok ve kategoriler sürümler arası değişebilir |
| `REDIS_URL` | Sunucu tarafı önbellek |
| `DISTRICT_BUFFER_M` | İlçe sınırına eklenen tampon (metre) |
| `LOCAL_MODE` | `true` ise `X-API-KEY` zorunlu değil, kota işlemez. Üretimde `false` |
| `CORS_ORIGINS` | Virgülle ayrılmış izinli origin listesi. Tarayıcı backend'e doğrudan gitmediği için pratikte devreye girmez; backend'i dışarıya açarsanız gerekir |

Buradaki her değişken kod tarafından **gerçekten okunuyor**. Bir değişken
eklerseniz onu okuyan kodu da ekleyin; okunmayan ayar, ayarlandığını sanan
bir sonraki kişiyi yanıltır.

## Erişim ve planlar

Anahtarlar `api_keys` tablosunda tutulur. Kodda **gerçekten plana bağlı
olan iki şey** vardır:

| | Ücretsiz | Pro / Enterprise |
|---|---|---|
| Arama yarıçapı | 2 km | 5 km |
| CSV dışa aktarım | ✗ | ✓ |

Günlük istek kotası plana değil, anahtarın kendisine bağlıdır
(`daily_limit`). Bir anahtarın planını değiştirmek için yeni anahtar
üretmeyin — mevcut anahtarı kullanan herkes dışarıda kalır:

```bash
curl -X PATCH http://localhost:8004/admin/keys/1 -H "X-ADMIN-KEY: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{"plan":"pro"}'
```

`GET /admin/keys` anahtarları id'leriyle listeler (düz anahtar dönmez).

## İlçe verisi

İlçe sorgusu yerel veritabanı üzerinde çalışır; veri önce çekilmelidir.
Kapsam **80 ilçe**: İstanbul, Edirne, Tekirdağ, Kırklareli, Malatya.

Komutlar `backend/` dizininden çalıştırılır (`app` paketi oradan
görünür):

```bash
cd backend && .venv/Scripts/python.exe -m app.ingest --province istanbul
```

```bash
cd backend && .venv/Scripts/python.exe -m app.ingest --district tr-34-kadikoy
```

```bash
cd backend && .venv/Scripts/python.exe -m app.ingest --all
```

`--province` plaka değil **il adı** alır: `istanbul`, `edirne`, `tekirdag`,
`kirklareli`, `malatya`. Taze kayıtları yeniden çekmek için `--force`.
Eşzamanlılık varsayılan 2'dir; Overpass IP başına 2 slot verdiği için
yükseltmek işe yaramaz.

### İkinci kaynak: Overture Maps

OSM tek başına yetmiyor. Ölçüldüğünde kayıtların yalnızca **%9,2'sinde
telefon** vardı — ve bu bir çıkarım hatası değildi: 30 878 kaydın ham
etiketleri kolonlarla karşılaştırıldığında etiketinde telefon olup
kolonu boş kalan **sıfır** kayıt çıktı. Bilgi kaynakta yoktu.

Kaynak seçimi teknik değil **lisans** kararıydı:

| Kaynak | Durum | Sebep |
|---|---|---|
| Google Places | ✗ | "place ID dışında içerik saklanamaz". Kalıcı veritabanı + CSV dışa aktarımıyla bağdaşmıyor |
| Yandex Geosearch | ✗ | Kalıcı saklama yasak (30 gün önbellek), sonuçlar Yandex haritası üzerinde ve sırası değiştirilmeden gösterilmeli |
| **Overture Maps** | ✓ | CDLA Permissive 2.0 / Apache 2.0 — saklama, veritabanı, dışa aktarım kısıtı yok |

Overture'ın places teması OSM materyalini **dışlıyor**, yani elimizdekiyle
çakışmıyor; tamamlıyor. Veri S3'te GeoParquet olarak duruyor ve DuckDB ile
uzaktan sorgulanıyor — indirme yok, ücretsiz, ilçe başına ~20 sn.

CLI'si yok; ilçe bazında HTTP ucundan çalışır:

```bash
curl -X POST http://localhost:8004/api/districts/tr-34-kadikoy/enrich -H "X-API-KEY: $SEARCH_API_KEY"
```

Uç iki iş yapar: mevcut kayıtların **boş** iletişim alanlarını doldurur
(dolu olanı ezmez — gönüllünün elle düzelttiği bir değeri geri almak en
kötü davranış olurdu) ve taksonomiye uyan yeni kurumları ekler. Kaydın
nereden geldiği `places.source` kolonunda (`osm` | `overture`) durur.

### Şu anki durum

80 ilçenin **tamamı** çekildi ve Overture ile zenginleştirildi:

| Kaynak | Kayıt | Telefon | Website | Adres |
|---|---:|---:|---:|---:|
| OSM | 30 878 | %16,7 | %13,0 | %31,1 |
| Overture | 23 379 | %78,5 | %63,4 | %85,5 |
| **Toplam** | **54 257** | **%43,3** | %34,7 | %54,5 |

Veri Docker volume'ünde (`backend_data`) durur, repoda değil. Yeni bir
kurulumda bu tablo boştur ve yukarıdaki komutların çalıştırılması gerekir.

## Kayıtlı yerler

Bulunan bir yer `/` ekranından kaydedilir ve `/kayitli` altında birikir.
Kalıcılık sunucudadır, tarayıcıda değil: sayfayı yenileseniz de başka bir
bilgisayardan girseniz de kayıtlar durur.

Sahiplik API anahtarı üzerindendir. Uygulama kişisel anahtar yokken
sunucunun anahtarına düştüğü için varsayılan davranış **"tüm ekip aynı
listeleri paylaşır"** olur.

İki kural bilinçlidir:

- **Bir yer takım başına bir kez kaydedilir**, listeler arasında taşınır.
  Aynı kurumun iki listede iki farklı notla durması devir teslimi bozar.
- **Liste silmek içindeki yerleri silmez**, dosyalanmamışa düşürür. Liste
  bir klasör, çöp kutusu değil.

## Proje yapısı

```
├── PRODUCT.md              # Kullanıcı, amaç, tasarım ilkeleri (strateji)
├── design.md               # Kilitli görsel sistem (Cobalt)
├── src/
│   ├── app/
│   │   ├── page.tsx              # Harita ekranı
│   │   ├── kayitli/              # Kayıtlı yerler ve listeler
│   │   ├── admin/                # Yönetim ekranları
│   │   ├── api/                  # Backend'e giden proxy route'ları
│   │   ├── globals.css           # Temel katman + bileşen sınıfları
│   │   └── tokens.css            # Tasarım token'ları (tek renk/font kaynağı)
│   ├── components/
│   │   ├── AppHeader.tsx             # Paylaşılan başlık şeridi + gezinme
│   │   ├── MapView.tsx               # Leaflet haritası
│   │   ├── StrictModeMapContainer.tsx# react-leaflet 4 + React 18 uyumsuzluğu için
│   │   ├── DistrictPicker.tsx        # İl/ilçe seçimi
│   │   ├── CategoryFilter.tsx        # Tür filtresi (çoklu seçim, sayılı çipler)
│   │   ├── FilterPanel.tsx           # İlçe sorgusu filtreleri
│   │   ├── PlaceList.tsx             # Sonuç listesi
│   │   ├── SavedPlaceRow.tsx         # Kayıtlı yer satırı (not alanı dahil)
│   │   └── ModalShell.tsx            # Ortak modal kabuğu (Escape + odak tuzağı)
│   ├── lib/
│   │   ├── districts.ts        # İlçe API istemcisi + tür dönüşümü
│   │   ├── spring.ts           # Kesintiye uğratılabilir yay (harita uçuşu)
│   │   └── savedApi.ts         # Kayıtlı yerler ve listeler istemcisi
│   └── server/                 # Proxy katmanı, önbellek, hız sınırı
├── backend/
│   ├── app/
│   │   ├── routers/            # search, saved, export, districts, admin, ...
│   │   ├── ingest.py           # OSM/Overpass ilçe verisi çekme CLI'si
│   │   ├── overture.py         # Overture Maps sorgusu (DuckDB → S3)
│   │   ├── overture_ingest.py  # Zenginleştirme + yeni kayıt ekleme
│   │   ├── database.py         # SQLAlchemy modelleri
│   │   └── overpass.py         # Ayna failover + devre kesici
│   ├── tests/
│   └── README.md               # Backend ayrıntıları
├── vitest.config.ts
└── docker-compose.yml
```

## Test

Backend — `backend/` dizininden:

```bash
cd backend && .venv/Scripts/python.exe -m pytest -q
```

Frontend — kökten:

```bash
pnpm test
```

```bash
pnpm type-check
```

Frontend testleri Vitest ile koşuyor (`vitest.config.ts`). Kapsam şu an
dar: ağırlıklı olarak ilçe veri istemcisi (`src/lib/districts.test.ts`).
Bilinen üç kırık test var; hepsi dosyanın içinde **BULGU** olarak
gerekçesiyle birlikte belgelendi — kırık bırakılmaları bilinçli, davranışı
gizlemek yerine kayda geçirmek tercih edildi.

## Bilinen sınırlar

- **İletişim kapsaması hâlâ kısmi.** İki kaynağa rağmen kayıtların
  %43,3'ünde telefon var. Kalanı için üçüncü bir kaynak gerekir; OSM ve
  Overture'da o bilgi yok.
- **Harita taraması yavaş.** Soğuk önbellekte İstanbul viewport'unda bir
  arama dakikayı aşabilir; sebep Overpass'in yanıt süresi. İstemci zaman
  aşımı bu yüzden yüksek tutulmuştur.
- **Overpass ingest'i ayna sağlığına bağımlı.** Toplu çekimde ilçe başına
  3-20 dk sürdü ve ilk turda 74 ilçenin 14'ü düştü; tekrar turu 12'sini
  kurtardı. Overture tarafında bu sorun yok (S3, ~20 sn, kotasız).
- **DuckDB'de seyrek bir iç hata.** 79 ilçenin birinde
  `INTERNAL Error: Information loss on integer cast` alındı; deterministik
  değil, tekrar denemede geçti. Toplu koşularda tekrar denemeyi zorunlu
  kılan sebep budur.
- **Koyu mod yok.** `tailwind.config.ts` içindeki `darkMode: "class"`
  bilinçli olarak duruyor ama `dark` sınıfını hiçbir kod eklemiyor; Cobalt
  tek temalı bir sistemdir.
- **`react-leaflet` 4.2.1 React 18 StrictMode ile uyumsuz.** Geçici çözüm
  `StrictModeMapContainer` içinde; gerekçesi o dosyada yazılıdır.
- **Lisans belirtilmemiş.** Depoda `LICENSE` dosyası yoktur.

---

Next.js 14 · TypeScript · Tailwind · Leaflet · FastAPI · SQLite · Redis
