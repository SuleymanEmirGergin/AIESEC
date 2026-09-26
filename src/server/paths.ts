import { NextResponse } from "next/server";

/**
 * Catch-all yol parcalarini backend adresine guvenle ekler.
 *
 * Next parcalari cozulmus veriyor: "/api/saved/..%2F..%2Fadmin" tek parca
 * "../../admin" olarak gelir; oldugu gibi birlestirilince fetch adresi
 * normallestirip istegi BASKA bir backend ucuna (sunucunun anahtariyla)
 * gonderiyordu. Nokta parcalari reddedilir, kalan her parca yeniden
 * kodlanir. null: gecersiz yol.
 */
export function pathSuffix(segments: string[] = []): string | null {
  if (segments.some((s) => s === "" || s === "." || s === ".." || s.includes("/") || s.includes("\\"))) return null;
  return segments.map((s) => `/${encodeURIComponent(s)}`).join("");
}

export const badPath = () => NextResponse.json({ message: "Geçersiz adres." }, { status: 400 });
