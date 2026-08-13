# Nearby Place Finder 🗺️

Yakındaki fabrika, okul, ofis ve eğitim kurumlarını harita üzerinde gösteren modern Next.js aplikasyonu.

## ✨ Özellikler

- 🗺️ **İnteraktif Harita:** OpenStreetMap entegrasyonu ile Leaflet haritası
- 🎯 **Konum Tabanlı Arama:** Geolocation API ile kullanıcı konumu algılama
- 🏭 **Tip Filtreleme:** Fabrika, ofis, atölye, okul türleri için filtreleme
- 📏 **Yarıçap Seçimi:** 500m - 5km arası ayarlanabilir arama yarıçapı
- 🎨 **Modern Tasarım:** Trust & Authority + Educational tasarım sistemi
- 🌗 **Dark Mode:** Otomatik dark mode desteği
- 📱 **Responsive:** Mobil-öncelikli, tüm ekran boyutlarına uyumlu
- 🐳 **Docker Ready:** Production-ready multi-stage Dockerfile

## 🚀 Hızlı Başlangıç

### Gereksinimler

- Node.js 18.17+
- pnpm 8+ (önerilen)

### Kurulum

```bash
# 1. Bağımlılıkları yükle
pnpm install

# 2. Environment dosyasını oluştur
cp .env.local.example .env.local

# 3. .env.local dosyasını düzenle
# NEXT_PUBLIC_API_BASE=https://your-external-api.com

# 4. Development server'ı başlat
pnpm dev
```

Tarayıcıda [http://localhost:3000](http://localhost:3000) adresini açın.

## 🐳 Docker ile Çalıştırma

### Development

```bash
# Build
docker build -t nearby-place-finder .

# Run
docker run -p 3000:3000 --env-file .env.local nearby-place-finder
```

### Production (Docker Compose)

```bash
# Build ve başlat
docker-compose up -d

# Logları izle
docker-compose logs -f

# Durdur
docker-compose down
```

## 📁 Proje Yapısı

```
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── admin/
│   │   │   ├── page.tsx              # Admin paneli (raporlar)
│   │   │   └── overrides/page.tsx    # Admin paneli (override'lar)
│   │   ├── api/                      # Backend'e proxy route handler'lar
│   │   │   ├── admin/[...path]/      # Admin API passthrough
│   │   │   ├── admin/reports/
│   │   │   ├── export/
│   │   │   ├── me/
│   │   │   ├── presets/
│   │   │   ├── report/
│   │   │   └── search/
│   │   ├── layout.tsx                # Root layout
│   │   ├── page.tsx                  # Ana sayfa (arama + harita)
│   │   └── globals.css               # Global styles
│   ├── components/
│   │   ├── MapView.tsx               # react-leaflet harita
│   │   ├── PlaceList.tsx             # Sonuç listesi
│   │   ├── Filters.tsx               # Arama filtreleri
│   │   ├── ExportToolbar.tsx         # Dışa aktarma
│   │   ├── ReportModal.tsx           # Hata bildirimi
│   │   ├── SettingsModal.tsx         # Ayarlar
│   │   ├── UpgradeModal.tsx          # Plan yükseltme
│   │   ├── AdminReportsTable.tsx     # Admin: rapor listesi
│   │   ├── AdminReportDetail.tsx     # Admin: rapor detayı
│   │   ├── OverridesTable.tsx        # Admin: override listesi
│   │   └── OverrideForm.tsx          # Admin: override formu
│   ├── lib/                          # İstemci tarafı yardımcılar
│   │   ├── types.ts, configTypes.ts  # TypeScript tanımları
│   │   ├── api.ts                    # Ana API client (retry + timeout)
│   │   ├── api-client.ts             # Basit arama client'ı
│   │   ├── adminApi.ts               # Admin uçları
│   │   ├── labels.ts                 # Yer tipi etiketleri / grupları
│   │   ├── presets.ts                # Tip bazlı varsayılan yarıçaplar
│   │   ├── presetsCache.ts           # Preset localStorage cache (24 saat)
│   │   ├── cache.ts                  # Arama sonucu cache (5 dk TTL)
│   │   ├── retry.ts                  # Exponential backoff
│   │   ├── fetchTimeout.ts           # İstemci tarafı timeout
│   │   ├── debounce.ts               # Debounce
│   │   └── normalize.ts              # Overpass elementi → Place
│   ├── server/                       # Yalnızca sunucuda çalışan kod
│   │   ├── backend.ts                # Backend'e HTTP istekleri
│   │   ├── cache.ts                  # Sunucu içi cache
│   │   └── rateLimit.ts              # Rate limiting
│   └── shared/                       # İstemci/sunucu ortak kod
│       ├── types.ts
│       ├── categories.ts
│       └── normalize.ts
├── backend/                          # FastAPI backend (ayrı servis)
├── design-system/                    # Tasarım sistemi kaynağı (MASTER.md)
├── expo-osm-map/                     # Expo (React Native) harita uygulaması
├── docs/                             # Plan ve tasarım dokümanları
├── shared/types.ts                   # Repo düzeyinde paylaşılan tipler
├── public/markers/                   # Yer tipi marker SVG'leri
├── Dockerfile                        # Multi-stage production build
├── docker-compose.yml                # Docker Compose config
└── tailwind.config.ts                # Tailwind tema
```

## 🎨 Tasarım Sistemi

### Renkler

- **Primary:** `#0369A1` (Professional Blue)
- **Background (Light):** `#F8FAFC` (Slate 50)
- **Background (Dark):** `#0F172A` (Slate 900)

### Tipografi

- **Başlıklar:** Baloo 2 (Friendly, Educational)
- **Body:** Comic Neue (Readable, Approachable)

### Marker Renkleri (Tip Bazlı)

| Tip | Renk |
|-----|------|
| Fabrika | Kırmızı |
| Ofis | Mavi |
| Atölye | Turuncu |
| Anaokulu | Pembe |
| İlkokul | Mor |
| Ortaokul | Cyan |
| Lise | Yeşil |
| Özel Okul | Portakal |
| Üniversite | İndigo |

## 🔧 Environment Variables

```bash
# API Endpoint (required for production)
NEXT_PUBLIC_API_BASE=https://your-external-api.com

# Varsayılan harita konumu (İstanbul)
NEXT_PUBLIC_DEFAULT_LAT=41.0082
NEXT_PUBLIC_DEFAULT_LNG=28.9784
NEXT_PUBLIC_DEFAULT_ZOOM=12
```

## 🧪 API Endpoint Formatı

### Request

```
GET /api/search?type={type}&radius={radius}&lat={lat}&lng={lng}
```

**Parameters:**
- `type`: PlaceType ("factory" | "office" | "workshop" | "kindergarten" | ...)
- `radius`: number (500 | 1000 | 1500 | 3000 | 5000) in meters
- `lat`: number (latitude)
- `lng`: number (longitude)

### Response

```json
{
  "success": true,
  "data": [
    {
      "id": "unique-id",
      "name": "Yer Adı",
      "type": "kindergarten",
      "coordinates": {
        "lat": 41.0082,
        "lng": 28.9784
      },
      "address": "Tam adres",
      "distance": 850
    }
  ],
  "total": 5
}
```

## 📝 Geliştirme Notları

### SSR vs Client-Side

- **Leaflet:** Client-only (dynamic import ile)
- **Map State:** Client-side state management
- **API Calls:** Client-side (browser → Next.js API Route → External API)

### Mock Data

Eğer `NEXT_PUBLIC_API_BASE` tanımlanmamışsa, API route otomatik olarak mock data döner (development için).

## 🚢 Production Deployment

### Build

```bash
pnpm build
pnpm start
```

### Docker Production

```bash
docker-compose up -d --build
```

### Vercel Deploy

```bash
# .env.production dosyasını ayarla
vercel --prod
```

## 🧪 Test Checklist

- [ ] Leaflet haritası SSR hatası olmadan yükleniyor
- [ ] Tip seçimi çalışıyor
- [ ] Yarıçap değiştirme çalışıyor
- [ ] "Konumumu Kullan" butonu çalışıyor (permission handling)
- [ ] Search butonu API çağrısı yapıyor
- [ ] Marker'lar haritada görünüyor
- [ ] Popup açılıyor
- [ ] Liste ile harita senkronize
- [ ] Dark mode geçişi sorunsuz
- [ ] Mobile responsive (375px+)
- [ ] Docker container başarıyla çalışıyor

## 📄 Lisans

MIT License - AIESEC

## 🤝 Katkı

Pull request'ler kabul edilir. Büyük değişiklikler için önce issue açın.

---

**Built with ❤️ using Next.js 14, TypeScript, Tailwind CSS, and Leaflet**
