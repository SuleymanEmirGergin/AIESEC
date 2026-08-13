# Design — POI Finder

Bu uygulamanın kilitli tasarım sistemi. Her sayfa yeniden tasarlanırken
önce bu dosya okunur. **Sayfa başına yeniden üretilmez** — sistem büyümesi
gerektiğinde bu dosya genişletilir ya da değiştirilir.

Değerlerin çalışan hâli [`src/app/tokens.css`](src/app/tokens.css) içinde.
Bileşenler ham renk/font değeri yazmaz; hepsi adıyla çağrılır.

---

## Neden değişti

Önceki sistem `design-system/nearby-place-finder/MASTER.md` içinde
**"Mood: kids, education, playful, friendly, colorful, learning"** ile
üretilmişti — Baloo 2 + Comic Neue bundan geliyordu. Ürün ise fabrika,
ofis ve atölye tarayan, CSV çıkaran, API kotası ve plan yöneten bir B2B
lead-gen aracı. Tipografi başka bir ürün için seçilmişti.

Bu sistem ürünün gerçek işine göre seçildi: **enstrüman paneli**, pazarlama
sayfası değil.

---

## Genre

`modern-minimal` — B2B / veri aracı / API kaydı.

## Macrostructure aileleri

Bu projede pazarlama ya da içerik sayfası yok; üç route da uygulama sayfası.

| Aile | Macrostructure | Sayfalar | Varyasyon düğmeleri |
|---|---|---|---|
| Harita yüzeyi | **19 · Map / Diagram** | `src/app/page.tsx` | kenar çubuğu yoğunluğu, sonuç satırı yoğunluğu |
| Veri yüzeyi | **05 · Workbench** | `src/app/admin/page.tsx`, `src/app/admin/overrides/page.tsx` | tablo yoğunluğu, istatistik kartı sayısı |

**Harita yüzeyi mantığı:** harita sayfayı örgütler; kenar çubuğu onun
*lejantı*, export şeridi onun *tek CTA'sı*. Sayfanın kendi başlık hiyerarşisi
yoktur — mekân onu taşır.

## Theme — Cobalt

| Token | Değer | Rol |
|---|---|---|
| `--color-paper` | `oklch(98.5% 0.004 250)` | soğuk mühendislik zemini |
| `--color-paper-2` | `oklch(96.6% 0.005 252)` | yükseltilmiş yüzey |
| `--color-ink` | `oklch(24% 0.020 258)` | başlık |
| `--color-ink-2` | `oklch(34% 0.018 257)` | gövde |
| `--color-ink-3` | `oklch(55% 0.014 256)` | meta / sessiz |
| `--color-rule` | `oklch(90% 0.006 252)` | hairline |
| `--color-accent` | `oklch(58% 0.20 256)` | **tek sinyal** |
| `--color-focus` | `oklch(58% 0.20 256)` | focus ring |
| `--color-graphite` | `oklch(22% 0.016 260)` | sayfa başına tek koyu bant |

Saf `#fff` ve saf `#000` kullanılmaz. Aksan **viewport'un %5'inden azında**:
aktif filtre, birincil buton, focus ring, kota göstergesi, seçim rozeti.
Geniş alan dolgusu olarak asla.

Durum renkleri (`positive` / `caution` / `critical`) işlevseldir, dekoratif
değil — yalnızca ikon ve küçük metinde, hiçbir zaman yüzey dolgusu olarak.

## Typography

- **Display:** Space Grotesk 600, `normal` (italik başlık yasak), tracking `-0.02em`
- **Body:** Inter 400 / 500
- **Mono:** JetBrains Mono 400 / 500 — telefon, koordinat, kota, API anahtarı, versal etiketler
- Ölçek çıpası: `--text-display` = `clamp(1.75rem, 3vw + 0.75rem, 2.75rem)`

**Mono kuralı:** rakam taşıyan her alan `tabular-nums` ile mono. Telefon
numaraları ve koordinatlar alt alta hizalanmalı — bu okunabilirlik, süs değil.

## Spacing

4 puanlık adlandırılmış ölçek. Değerler `tokens.css` içinde. Sayfalar
`var(--space-md)` gibi adlandırılmış token kullanır, ham değer yazmaz.

## Motion

- Easing'ler: `--ease-out` `cubic-bezier(0.16, 1, 0.30, 1)`, `--ease-in`, `--ease-in-out`
- Süreler: `--dur-fast` 120ms · `--dur-short` 220ms · `--dur-mid` 400ms
- Reveal deseni: **yok**. Sayfa kurulmuş hâlde gelir; uygulama arayüzünde
  scroll-reveal veriyi geciktirmekten başka bir şey yapmaz.
- Yalnızca `transform` ve `opacity` animasyonlanır — layout özellikleri asla.
- Focus ring **animasyonsuz**: gecikmeli bir ring, klavyeyle gezen
  kullanıcının odağını geç öğrenmesi demek.
- `prefers-reduced-motion: reduce` altında tüm geçişler kesilir.
- Sıçrama / aşma (bounce, overshoot) yasak.

## Microinteractions duruşu

- **Sessiz başarı** — kutlama toast'ı yok. İşlem sonucu arayüzün kendisinde görünür.
- Hover ipucu gecikmesi 800ms; focus ipucu gecikmesi 0ms.
- Yıkıcı olmayan işlemlerde onay diyaloğu yok.
- Uzun süren işlemler (arama 12sn+) durumu **satır içinde** bildirir, modal açmaz.

## CTA sesi

- **Birincil:** dolu aksan, `6px` yarıçap, `--font-body` 500. Hedefi adlandırır ("CSV indir"), "Tıklayın" demez.
- **İkincil:** şeffaf zemin + hairline kenarlık, aynı yarıçap.
- Hap (pill) ve gradyan buton yok.
- Buton metni **asla iki satıra sarmaz** — dokunma hedefi bölünür.

## Sayfa başına izinler

- Uygulama sayfaları **enrichment kullanmaz** — işlevi sayfa taşır.
  Hero illüstrasyonu, demo videosu, soyut arka plan yok.
- Sayfa başına **tek koyu bant** (grafit). Ana sayfada bu export şeridi.
- Arka plan dokusu / deseni / mesh blob yok.

## Sayfaların paylaşması ZORUNLU olanlar

- Logotype ve başlık şeridi yapısı
- Aksan rengi ve yerleşimi (≤ %5)
- Display + body + mono üçlüsü
- CTA sesi (buton biçimi, yarıçap, dolgu ritmi)
- Hairline dili — kutulu gölgeli kart yok, derinlik kenardan gelir

## Sayfaların FARKLILAŞABİLECEĞİ yerler

- Aile içindeki macrostructure (harita yüzeyi ↔ veri yüzeyi)
- Tablo / liste yoğunluğu
- Kenar çubuğunun var olup olmaması

## Yasaklar

Bu sistemde şunlar yer almaz — biri görünürse sistemden sapılmıştır:

- Gradyan metin, glassmorphism, mesh/aurora blob, arka plan dokusu
- Kutulu `shadow-xl` kartlar (derinlik hairline'dan gelir)
- Üç eşit ikonlu özellik ızgarası
- İtalik başlık
- Ortalanmış-her-şey düzeni
- Uydurulmuş metrik, sahte rozet, olmayan özellik ("PDF export" gibi)

---

## Exports

### tokens.css

Kaynak: [`src/app/tokens.css`](src/app/tokens.css). Başka bir projeye
taşımak için o dosya tek başına kopyalanabilir.

### Tailwind

Tailwind eşlemesi [`tailwind.config.ts`](tailwind.config.ts) içinde;
renkler ham değer değil `var(--color-*)` referansı olarak tanımlı, yani
palet değişikliği yalnızca `tokens.css`'i etkiler.

### DTCG `tokens.json`

```json
{
  "color": {
    "paper":  { "$value": "oklch(98.5% 0.004 250)", "$type": "color" },
    "ink":    { "$value": "oklch(24% 0.020 258)",   "$type": "color" },
    "rule":   { "$value": "oklch(90% 0.006 252)",   "$type": "color" },
    "accent": { "$value": "oklch(58% 0.20 256)",    "$type": "color" }
  },
  "font": {
    "display": { "$value": "Space Grotesk", "$type": "fontFamily" },
    "body":    { "$value": "Inter",         "$type": "fontFamily" },
    "mono":    { "$value": "JetBrains Mono","$type": "fontFamily" }
  },
  "space": {
    "sm": { "$value": "1rem",   "$type": "dimension" },
    "md": { "$value": "1.5rem", "$type": "dimension" },
    "lg": { "$value": "2rem",   "$type": "dimension" }
  }
}
```
