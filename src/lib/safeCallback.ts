/**
 * Giristen sonra donulecek adres: yalnizca bu sitenin bir yolu.
 * Middleware tam URL veriyor; baska siteye yonlendirme (acik yonlendirme)
 * olmamali. "https://x//kotu.com" gibi bir degerin yolu "//kotu.com" olur
 * ve tarayici bunu baska bir alan adi sayar; bu yuzden "//" reddediliyor.
 */
export function safeCallback(value: string | undefined): string {
  if (!value) return "/";
  try {
    const url = new URL(value, "http://yerel");
    const path = `${url.pathname}${url.search}`;
    return path.startsWith("/") && !path.startsWith("//") ? path : "/";
  } catch {
    return "/";
  }
}
