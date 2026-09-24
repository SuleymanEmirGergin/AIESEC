# POI Finder

AIESEC gönüllülerinin staj ve değişim programları için **ortak kurum**
bulmasına yarayan harita aracı: bir ilçedeki okulları, şirketleri,
otelleri, müzeleri ve benzeri kurumları iletişim bilgileriyle birlikte
bulur, adlandırılmış listelere kaydeder, CSV olarak dışa aktarır.

**21 tür, dört grup:** İşletmeler (Fabrika, Şirket, Holding, Ofis, Atölye),
Eğitim Kurumları (Anaokulu, İlkokul, Ortaokul, Lise, Özel Okul, Kolej,
Üniversite, Dil Kursu), Konaklama & Hizmet (Otel, Emlak Ofisi, Seyahat
Acentesi), Gezi & Eğlence (Hayvanat Bahçesi & Akvaryum, Tema & Su Parkı,
Müze, Botanik Bahçesi, Milli Park & Doğa Alanı). Tek kaynak
`src/lib/labels.ts` ve backend `queries.ALL_TYPES`; ikisi testle aynı
tutulur.

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
seyrek (telefon %19,7); Overture Maps aynı bölgelerde çok daha dolu
(%75,1). Overture'ın places teması OSM materyalini dışlıyor ama aynı
kurum iki kaynakta ayrı kayıt olabiliyor; enrich bunları ad + 150 m ile
eşleştirip tek kayıtta birleştirir. Kaynak seçimi lisansa göre yapıldı —
ayrıntısı aşağıda "İlçe verisi".

Tarayıcı backend'e doğrudan gitmez. Tüm istekler Next.js route'larından
geçer; API anahtarı orada eklenir ve istemciye hiç ulaşmaz.

## Ekranlar

| Route | Ne yapar |
|---|---|
| `/` | Harita + il/ilçe seçimi, kategori filtresi (çoklu seçim, sayılı), filtre paneli, sayfalanan sonuç listesi, kaydetme |
| `/kayitli` | Kaydedilen yerler, adlandırılmış listeler, tür filtresi, not ve temas geçmişi, CSV indirme, indirme geçmişi |
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
| `OVERPASS_URLS` | Virgülle ayrılmış ayna listesi; failover buna göre. **Cevap vermeyen aynayı listede tutmayın**: yedeklilik sağlamaz, yalnızca deneme başına 20-40 sn yer. **Bölgesel aynayı da tutmayın:** `overpass.osm.ch` yalnızca İsviçre verisi taşıyor ve Türkiye sorgusuna boş ama geçerli yanıt veriyor. Yeni ayna eklemeden önce Türkiye bbox'ında dolu sonuç geldiğini görün. 2026-09 itibarıyla çalışan ikili: `overpass-api.de`, `maps.mail.ru` |
| `OVERPASS_TIMEOUT` | Hem HTTP zaman aşımı hem sorguya gömülen `[out:json][timeout:N]` |
| `OVERPASS_COOLDOWN_BASE` | Başarısız aynanın ilk bank süresi (sn, varsayılan 15). Üst üste hatalarda katlanarak uzar |
| `OVERPASS_COOLDOWN_MAX` | Bank süresi tavanı (sn, varsayılan 300) |
| `OVERPASS_PROVEN_FAIL_LIMIT` | Bir kez çalışmış ayna kaç ardışık hataya kadar öncelikli sayılır (varsayılan 3) |
| `OVERTURE_RELEASE` | Overture sürümü (varsayılan `2026-08-19.0`). Sabit tutulur: "latest" yolu yok ve kategoriler sürümler arası değişebilir. **Overture eski sürümleri S3'ten siler**; silinen sürümde enrich 500 döner. `2026-09-23.0` şemayı değiştirdi (`categories` yok) ve mevcut sorguyla çalışmaz — `2026-08-19.0` kalkmadan sorgu uyarlanmalı |
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
yükseltmek işe yaramaz. Sağlıklı aynayla tam tur (`--all --force`)
yaklaşık 80 dakika sürer; ilçe başına 20 sn - 10 dk.

Yeniden çekim mevcut veriyi bozmaz, üç koruma var: dolu iletişim alanı
boşla ezilmez (Overture zenginleştirmesi korunur); önceden kaydı olan bir
ilçe sıfır kayıtla dönerse bu ayna sorunu sayılır, üyelik korunur ve ilçe
`failed` işaretlenir; ilçe üyeliği yeniden yazılırken yalnızca OSM
kaynaklı satırlara dokunulur, Overture üyeliği enrich'in işidir.

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

Eşleştirme koordinata bakar (ilçe bbox'ı), `place_districts` join'ine
değil: üyelik türetilmiş durumdur ve bir kez silinince aynı kurum ikinci
kez eklenmişti (677 çift). Ayrıca OSM'nin aynı kurumu hem nokta hem alan
olarak çizdiği durumlar ingest'te tekilleştirilir; iletişimi fazla olan
kalır. Adı " Province" ile biten Overture kayıtları idari alandır, atlanır.

### Şu anki durum

80 ilçenin **tamamı** çekildi ve Overture ile zenginleştirildi
(2026-09-16; 77 ilçe `ok`, 3 `partial`):

| Kaynak | Kayıt | Telefon | Website | Adres |
|---|---:|---:|---:|---:|
| OSM | 34 659 | %19,7 | %15,6 | %34,1 |
| Overture | 61 236 | %75,1 | %58,8 | %83,8 |
| **Toplam** | **95 895** | **%55,1** | %43,2 | %65,9 |

En kalabalık türler Fabrika (19,6k), Emlak Ofisi (16,0k), Ofis (15,5k),
Otel (12,2k). 2 082 kayıt sınıflandırılamadı (`place_type` NULL); filtre
panelinde "Sınıflandırılamayanları göster" ile görülür.

Veri Docker volume'ünde (`backend_data`) durur, repoda değil. Yeni bir
kurulumda bu tablo boştur ve yukarıdaki komutların çalıştırılması gerekir.

## Kayıtlı yerler

Bulunan bir yer `/` ekranından kaydedilir ve `/kayitli` altında birikir.
Kalıcılık sunucudadır, tarayıcıda değil: sayfayı yenileseniz de başka bir
bilgisayardan girseniz de kayıtlar durur.

Sahiplik API anahtarı üzerindendir. Uygulama kişisel anahtar yokken
sunucunun anahtarına düştüğü için varsayılan davranış **"tüm ekip aynı
listeleri paylaşır"** olur.

CSV dışa aktarımı Excel'in Türkçe yereli için biçimlendirilir: ayıraç `;`,
başlıklar Türkçe, telefonlar boşluklu metin (`+90 542 470 34 86`), konum
tek hücre + Google Maps bağlantısı, dosya BOM'lu. Virgüllü ve ham hali
Excel'de tek sütuna yığılıyor ve telefonları `9,05E+11` yapıyordu.

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

Frontend testleri Vitest ile koşuyor (`vitest.config.ts`); 27 test,
ağırlıklı olarak ilçe ve kayıtlı yer istemcileri. Backend 374 test.
Backend testlerini yerel venv yerine imajın içinde de koşabilirsiniz;
çalışan konteynere dokunmaz:

```bash
docker run --rm -v "$PWD/backend:/src" -w /src aiesec-backend python -m pytest -q -p no:cacheprovider
```

## Bilinen sınırlar

- **İletişim kapsaması hâlâ kısmi.** İki kaynağa rağmen kayıtların
  %55,1'inde telefon var. Kalanı için üçüncü bir kaynak gerekir; OSM ve
  Overture'da o bilgi yok.
- **Kalan çiftler.** Overture'ın kendi içinde aynı adlı iki kayıt
  (ör. 350 m arayla iki "Hagia Sophia Museum") ve OSM'de relation + way
  olarak çizilmiş kurumlar hâlâ iki satır. Nadir; birleştirme yalnızca
  kaynaklar arası ve node/way için yapılıyor.
- **Harita taraması yavaş.** Soğuk önbellekte İstanbul viewport'unda bir
  arama dakikayı aşabilir; sebep Overpass'in yanıt süresi. İstemci zaman
  aşımı bu yüzden yüksek tutulmuştur.
- **Overpass ingest'i ayna sağlığına bağımlı.** Ölü aynayla 80 ilçenin
  9'u, sağlıklı aynayla 76'sı ilk turda geçti; geçici DNS hataları
  birkaç ilçeyi düşürüyor, `--district` ile tekrar yeter. Overture
  tarafında bu sorun yok (S3, ~20 sn, kotasız).
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
