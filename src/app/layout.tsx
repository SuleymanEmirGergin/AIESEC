import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
// Kume varsayilanlari globals.css'ten ONCE: oradaki .marker-cluster-*
// renkleri bunlari ezmeli. react-leaflet-cluster v4 CSS'i kendisi yuklemiyor.
import "react-leaflet-cluster/dist/assets/MarkerCluster.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.Default.css";
import "./globals.css";
import "leaflet/dist/leaflet.css";

/**
 * Fontlar derleme aninda indirilip siteyle birlikte sunuluyor (next/font).
 * Onceden her ziyarette Google Fonts'tan yukleniyordu: kullanicinin IP'si
 * Google'a gidiyordu (KVKK) ve CSP'ye iki dis koken eklemek gerekiyordu.
 * latin-ext: Turkce harfler (ğ, ş, ı, İ) icin sart.
 */
const display = Space_Grotesk({ subsets: ["latin", "latin-ext"], weight: ["500", "600", "700"], variable: "--font-space-grotesk", display: "swap" });
const body = Inter({ subsets: ["latin", "latin-ext"], weight: ["400", "500", "600"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin", "latin-ext"], weight: ["400", "500", "600"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Rota", template: "%s · Rota" },
  description: "Ekibin kurum bulma ve takip aracı: ilçedeki okul, otel ve firmaları bul, listele, ara, takip et.",
  applicationName: "Rota",
  authors: [{ name: "Rota" }],
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
    <html lang="tr" suppressHydrationWarning className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </head>
      <body>{children}</body>
    </html>
  );
}
