const isDev = process.env.NODE_ENV !== "production";

/**
 * Icerik guvenlik politikasi. Tarayici yalnizca kendi kokenimizden kod,
 * stil, font ve veri yukler; gorseller ek olarak OSM harita karolarindan.
 *
 * ponytail: script-src 'unsafe-inline' - Next'in satir ici hidrasyon
 * betikleri icin. Nonce'lu CSP her sayfayi dinamik render'a zorlar;
 * kodda HTML enjeksiyonu noktasi olmadigi icin simdilik bu yeterli.
 * Dis betik, cerceveleme ve veri sizdirma (connect-src) yine kapali.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://*.tile.openstreetmap.fr",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  // Google ile giris: form bize gonderilir, cevap Google'a yonlendirir.
  "form-action 'self' https://accounts.google.com",
  "object-src 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // "X-Powered-By: Next.js" surum/altyapi bilgisini disari vermesin.
  poweredByHeader: false,
  output: 'standalone', // Enable for Docker
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
};

module.exports = nextConfig;
