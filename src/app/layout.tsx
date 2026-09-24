import type { Metadata } from "next";
// Kume varsayilanlari globals.css'ten ONCE: oradaki .marker-cluster-*
// renkleri bunlari ezmeli. react-leaflet-cluster v4 CSS'i kendisi yuklemiyor.
import "react-leaflet-cluster/dist/assets/MarkerCluster.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.Default.css";
import "./globals.css";
import "leaflet/dist/leaflet.css";

export const metadata: Metadata = {
  title: "Yakındaki Yer Bulucu | Nearby Place Finder",
  description:
    "Çevrenizdeki fabrika, okul, ofis ve atölyeleri harita üzerinde keşfedin. Konum tabanlı yer arama uygulaması.",
  keywords: ["harita", "yer bulucu", "okul", "fabrika", "ofis", "konum"],
  authors: [{ name: "AIESEC" }],
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  /**
   * Cobalt tek temali: acik zemin uzerinde tek bir koyu bant. Onceden
   * burada bir koyu mod rengi de vardi ama uygulamada koyu mod hicbir
   * zaman devreye girmiyordu; tarayici cubugu ile sayfa birbirinden
   * ayri renklere gidiyordu.
   */
  // --color-paper'in sRGB karsiligi. Tarayici chrome rengi CSS
  // degiskeni kabul etmiyor, literal deger zorunlu; tokens.css
  // degisirse burasi da guncellenmeli.
  themeColor: "#f8fafd",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        {/*
          Fontlar CSS `@import` yerine buradan yukleniyor. `@import`,
          tarayicinin stil dosyasini indirip ayristirmasini bekletir ve
          font istegini zincirin sonuna atar; <link> istegi belge
          ayristirilirken hemen baslatiyor.

          preconnect iki ayri kokene gerekiyor: fonts.googleapis.com CSS'i,
          fonts.gstatic.com ise font dosyalarini sunuyor. crossOrigin
          ikincisinde zorunlu, cunku font indirmeleri CORS ile yapiliyor.
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
