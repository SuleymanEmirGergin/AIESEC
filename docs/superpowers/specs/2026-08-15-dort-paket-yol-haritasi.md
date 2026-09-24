# Yol haritası: Dört paket

**Tarih:** 2026-08-15
**Durum:** Onaylandı
**Kapsam:** Program düzeyi. Her paketin kendi tasarım dokümanı ayrıca yazılır.

## Amaç

Projeyi dört bağımsız iş paketiyle ilerletmek. Bu doküman paketleri
tanımlar, sıralar ve aralarındaki bağımlılıkları kaydeder. Ayrıntılı
tasarım her paketin kendi spec'inde.

Dördü tek spec'e sığmıyor: biri şema + arayüz işi, biri altyapı, biri
operasyon, biri araştırmayla kapısı açılan bir bilinmez. Tek dokümanda
tasarlamak dördünü de yüzeysel tasarlamak olurdu.

## Ölçülen başlangıç durumu

Aşağıdaki sayılar 2026-08-15'te `feat/taksonomi-universite` dalında
ölçüldü. Yol haritasının gerekçeleri bunlara dayanıyor.

| Ölçüm | Değer | Nasıl ölçüldü |
|---|---|---|
| Backend testleri | 300 geçiyor, 120 sn | `pytest -q` |
| Backend kapsamı | **%79,07** | `pytest --cov` |
| Frontend testleri | 3 geçiyor, 3 kırık, **13 atlanıyor** | `pnpm test` |
| Frontend test dosyası sayısı | 1 (`src/lib/districts.test.ts`) | — |
| CI | **yok** (`.github` dizini yok) | — |
| Repo görünürlüğü | public, PR akışı kullanımda, 3 PR açık | `gh repo view`, `gh pr list` |
| Veri kapsamı | 80 ilçe / 5 il, 54 257 kayıt | README |
| Telefon kapsaması | %43,3 | README |
| LICENSE | yok | — |

En zayıf korunan dosyalar, sonraki paketlerin dokunacağı dosyalarla
örtüşüyor:

| Dosya | Kapsam | Hangi paket dokunacak |
|---|---:|---|
| `backend/app/routers/saved.py` | %46,15 | Paket 2 (temas takibi) |
| `backend/app/routers/admin.py` | %46,39 | — |
| `backend/app/routers/health.py` | %51,92 | — |
| `backend/app/auth.py` | %56,14 | Paket 2 (dolaylı) |
| `backend/app/ingest.py` | %63,25 | Paket 3 ve 4 |
| `backend/app/overture.py` | %23,68 | Paket 3 (dolaylı) |

`overture.py`'nin düşüklüğü mazeretli: S3/DuckDB istemcisi, ağ olmadan
anlamlı test edilemiyor.

## Sıra ve gerekçesi

```
1. CI + test sağlığı   →  2. Temas takibi   →  3. Kapsam    →  4. Üçüncü kaynak
   (altyapı)               (ürün)              (operasyon)     (araştırma + ürün)
                                                    ↑
                    Paket 4'ün lisans araştırması en başta koşar;
                    sonucu 3 ve 4'ün önceliğini değiştirebilir.
```

**CI önce**, çünkü kalan üç paketin üçü de backend'e dokunuyor ve şu an
300 testin otomatik bekçisi yok. Dahası temas takibi, yarısı test
edilmemiş bir dosyanın (`saved.py`, %46) üstüne inecek.

**Üçüncü kaynak sonda**, çünkü tek gerçek bilinmezi o taşıyor: lisans.
Overture'ın seçilme sebebi teknik değil hukukiydi — Google Places ve
Yandex tam da bu yüzden elendi (bkz. README, "İkinci kaynak"). MEB ve
TOBB için aynı soru cevaplanmadan mimari çizmek çöpe gidecek tasarım
üretmek olur. Bu yüzden **lisans araştırması programın en başında,
kendi paketinden bağımsız olarak koşar.**

## Paketler

### Paket 1 — CI + test sağlığı (T15)

**Spec:** `2026-08-15-ci-ve-test-sagligi-design.md`

GitHub Actions kurulur; `districts.test.ts` içindeki 13 atlanan ve 3
kırık test tek tek karara bağlanır. O dosya aslında bir test paketi
değil, teslim edilmemiş bir devir teslim notu: her atlama "T15 kapsamı
dışı" diye etiketlenmiş, ama T15 hiç koşulmamış. Bu paket T15'i kapatır.

**Sınır:** E2E, bileşen testleri, Docker imajı build'i, deploy ve
branch protection **ayarı** kapsam dışı.

### Paket 2 — Temas takibi + gönüllü adı

Kaydedilen yere temas durumu (arandı / cevap verdi / anlaşıldı /
ilgilenmiyor gibi), temas tarihi ve gerçekten kim olduğu bilgisi
eklenir. Bugün `SavedPlace` yalnızca `note` tutuyor; ürünün amacı
"gerçek temasa geçmek" olmasına rağmen uygulama CSV'de bitiyor.

**Neden önemli:** PRODUCT.md "kurum hafızası arayüzün içinde olmalı,
ayrılan kişinin kafasında değil" diyor. "Bu okulu geçen dönem aradık,
ilgilenmediler" bilgisi bugün hiçbir yerde durmuyor.

**Açık sorular (spec sırasında karara bağlanacak):**

- Gönüllü kimliği nasıl kurulur? Bugün `saved_by = api_key.name`
  (`backend/app/routers/saved.py:266`) ve herkes sunucunun anahtarına
  düştüğü için her satırda aynı isim yazıyor. Yani kolon ve arayüz var,
  bilgi yok. Tam kimlik doğrulama mı, hafif bir "ben kimim" alanı mı?
- Durum kümesi ne olacak, ve kapalı bir küme mi yoksa serbest mi?
- Tek durum mu tutulacak, yoksa temas geçmişi mi?
- Kişi adı ve temas kaydı tutmanın KVKK karşılığı.

### Paket 3 — Üçüncü veri kaynağı

İletişim kapsaması iki kaynağa rağmen %43,3. Kalan için üçüncü bir
kaynak gerekiyor; MEB (okullar) ve TOBB / sanayi odaları (fabrikalar)
tam da hedef kategorilere denk geliyor.

**Açık sorular:**

- **Lisans.** Yeniden dağıtım, kalıcı saklama ve CSV dışa aktarım izni
  var mı? Cevap "hayır"sa paket baştan başka bir şeye dönüşür (ör.
  gönüllünün elle girdiği iletişim bilgisi + kaynak gösterimi).
- Veriye nasıl erişilir: açık veri portalı, API, yoksa başka bir yol mu?
- Mevcut kayıtla eşleştirme nasıl yapılır (ad + konum yakınlığı)?
- `places.source` alacağı yeni değerler.

### Paket 4 — Veri kapsamını genişletme

Kapsam bugün 5 il / 80 ilçe. Yeni il eklemek `backend/scripts/fetch_districts.py:42`
içindeki `PROVINCES` listesine satır eklemek kadar kolay — **ama asıl iş
orada değil.**

**Açık sorular:**

- **Sınır verisinin boyutu.** İlçe poligonları tek dosya olarak tarayıcıya
  iniyor (`districts.geojson`, 80 ilçe için ~330 KB). İl sayısı artınca
  bu dosya da büyür ve her ziyaretçi hepsini indirir. Parçalama ve tembel
  yükleme gerekiyor.
- **Ingest'i kim koşacak?** Bugün arayüzde çekme tetikleyicisi yok;
  gönüllü "veri çekilmemiş" mesajını görüyor ama bir şey yapamıyor
  (`src/app/page.tsx:458`). Paket 1 bu konudaki terk edilmiş
  `triggerDistrictIngest` testini siliyor ve soruyu buraya devrediyor.
  Not: ingest ilçe başına 3-20 dk sürüyor, yani senkron bir HTTP çağrısı
  olamaz — arka plan işi ve durum takibi gerekir.
- Hangi iller, hangi sırayla?

## Program riskleri

| Risk | Etki | Karşılık |
|---|---|---|
| Paket 3'ün lisans cevabı olumsuz | Paket 3 baştan yeniden tasarlanır | Araştırma en başta koşar, tasarımdan önce |
| Overpass ayna sağlığı | Paket 4'te ingest turları düşer | Bilinen sorun; README'de belgeli, tekrar turu gerekiyor |
| `saved.py` %46 kapsamla paket 2'ye giriyor | Sessiz gerileme | Paket 1 o dosyaya nokta atışı test ekliyor |
| Üç PR açık bekliyor | Dallar birbirinden uzaklaşıyor | CI kurulunca üçü de denetlenir |

## Kapsam dışı (bu programda yok)

Bu dört pakete girmeyen, ama kayda değer bulunan konular. Ayrı ele
alınmaları gerekirse kendi yol haritalarını hak ederler:

- **Dağıtım / barındırma.** Docker ve compose var, ama uygulamanın
  gönüllüye hangi adresten ulaştığı belirsiz. SQLite tek volume'de,
  yedek elle alınmış görünüyor (`storage-yedek.db` depoda duruyor).
- **Mobil.** `expo-osm-map` iki commit'lik ölü bir iskelet. Web tarafında
  tüm TSX dosyalarında toplam 10 responsive sınıf var — pratikte
  masaüstü uygulaması.
- **Gözlemlenebilirlik.** `backend/app/routers/metrics.py` 17 satır.
  Hangi ilçe aranıyor, ne kadar sürüyor, kim kaydediyor — veri yok.
- **LICENSE.** Depo public ve lisans dosyası yok.
- **Erişilebilirlik denetimi.** PRODUCT.md WCAG 2.1 AA taahhüt ediyor,
  otomatik denetim yok.
- **Depo temizliği.** Kökte ve `backend/` altında tek seferlik doğrulama
  betikleri ve log dosyaları birikmiş (`verify_*.py`, `verify_api*.js`,
  `*.log`, `overhaul_*.txt`, `test_output.txt`).
