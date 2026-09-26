/**
 * OSM iletisim etiketlerinin normallestirilmesi.
 *
 * Ayni bilgi OpenStreetMap'te iki ayri semayla yaziliyor: duz (`phone`,
 * `email`, `website`) ve `contact:` onekli (`contact:phone`, ...). Hangi
 * semanin kullanildigi bolgeye ve veriyi giren kisiye gore degisiyor,
 * ikisi birden dolu olan kayitlar da var. Bu yuzden "telefon var mi"
 * sorusunun tek bir etikete bakarak cevabi yok.
 *
 * Bu modul kontrolu tek yerde topluyor; harita popup'i, sonuc listesi ve
 * CSV export ayni sonucu gormeli.
 */

export interface ContactInfo {
  phone?: string;
  email?: string;
  website?: string;
}

/**
 * Anahtar sirasi onceliktir: once en spesifik/yaygin olan denenir.
 * `contact:mobile` ve `mobile` sona birakildi - sabit hat varken cep
 * numarasi gostermek istemiyoruz, ama baska bir sey yoksa o da bilgidir.
 */
const PHONE_KEYS = ["phone", "contact:phone", "telephone", "contact:mobile", "mobile"];
const EMAIL_KEYS = ["email", "contact:email"];
const WEBSITE_KEYS = ["website", "contact:website", "url", "contact:url"];

function pickTag(
  tags: Record<string, string> | undefined,
  keys: readonly string[]
): string | undefined {
  if (!tags) return undefined;
  for (const key of keys) {
    const value = tags[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

/** Ham OSM etiketlerinden telefon/e-posta/web adresini cikarir. */
export function extractContact(tags?: Record<string, string>): ContactInfo {
  return {
    phone: pickTag(tags, PHONE_KEYS),
    email: pickTag(tags, EMAIL_KEYS),
    website: pickTag(tags, WEBSITE_KEYS),
  };
}

/** Gosterilecek en az bir iletisim alani var mi. */
export function hasContact(contact: ContactInfo): boolean {
  return Boolean(contact.phone || contact.email || contact.website);
}

/**
 * OSM'de birden fazla deger `;` ile ayriliyor ("+90 212 ... ;+90 532 ...").
 * Gosterirken hepsini birakiyoruz, baglanti icin ilkini aliyoruz.
 */
function firstValue(raw: string): string {
  return raw.split(";")[0].trim();
}

/** `tel:` baglantisi. Bosluk ve ayirici karakterler cevirici tarafinda sorun cikariyor. */
export function telHref(phone: string): string {
  return `tel:${firstValue(phone).replace(/[^\d+]/g, "")}`;
}

/**
 * WhatsApp baglantisi; yalnizca Turkiye cep numaralarinda (+90 5xx). Sabit
 * hatta WhatsApp olmaz, bos bir buton gonulluyu yaniltirdi.
 */
export function whatsappHref(phone: string): string | null {
  let digits = firstValue(phone).replace(/\D/g, "");
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10) digits = `90${digits}`;
  return /^905\d{9}$/.test(digits) ? `https://wa.me/${digits}` : null;
}

export function mailtoHref(email: string): string {
  return `mailto:${firstValue(email)}`;
}

/**
 * OSM'deki web adreslerinin bir kismi protokolsuz ("ornek.com.tr").
 * Boyle bir degeri href'e oldugu gibi koymak tarayicida goreli yol
 * olarak yorumlanir ve uygulamanin kendi icine gider.
 */
export function websiteHref(website: string): string {
  const value = firstValue(website);
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

/** Dar bir popup'ta okunabilir kalmasi icin protokol ve `www.` atiliyor. */
export function websiteLabel(website: string): string {
  return firstValue(website)
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/$/, "");
}
