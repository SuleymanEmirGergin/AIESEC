import type { Metadata } from "next";
import "./globals.css";
import "leaflet/dist/leaflet.css";

export const metadata: Metadata = {
  title: "Yakındaki Yer Bulucu | Nearby Place Finder",
  description:
    "Çevrenizdeki fabrika, okul, ofis ve atölyeleri harita üzerinde keşfedin. Konum tabanlı yer arama uygulaması.",
  keywords: ["harita", "yer bulucu", "okul", "fabrika", "ofis", "konum"],
  authors: [{ name: "AIESEC" }],
  viewport: "width=device-width, initial-scale=1, maximum-scale=5",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F8FAFC" },
    { media: "(prefers-color-scheme: dark)", color: "#0F172A" },
  ],
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
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
