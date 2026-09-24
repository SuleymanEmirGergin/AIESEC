"use client";

import React from "react";
import { Phone, Mail, Globe } from "lucide-react";
import {
  extractContact,
  hasContact,
  mailtoHref,
  telHref,
  websiteHref,
  websiteLabel,
} from "../lib/contact";

interface ContactLinksProps {
  /** Ham OSM etiketleri; normallestirme extractContact icinde. */
  tags?: Record<string, string>;
  /**
   * "popup": harita balonunda tam satirlar (ikon + deger).
   * "compact": sonuc listesinde tek satira sigan kucuk rozetler.
   */
  variant?: "popup" | "compact";
  /** Hicbir iletisim bilgisi yoksa gosterilecek metin; verilmezse bilesen hic render edilmez. */
  emptyLabel?: string;
}

/**
 * Bir yerin telefon/e-posta/web bilgisini tiklanabilir baglantilar olarak
 * gosterir.
 *
 * Bu veri backend'den bastan beri geliyordu (Place.tags icinde) ama hicbir
 * ekranda basilmiyordu: harita popup'i yalnizca isim, adres ve tur
 * gosteriyordu. Yani bilgi vardi, gorunurlugu yoktu.
 *
 * Renk disiplini: ikonlar sessiz murekkep, aksan yalnizca hover'da. Uc
 * alan icin uc ayri kromatik renk (yesil/mavi/mor) kullanmak temanin
 * "tek sinyal" kuralini bozuyor ve sonuc listesinde her satiri bir
 * trafik isigina ceviriyordu.
 *
 * Baglantilarda stopPropagation sart: bilesen hem harita balonunda hem de
 * tiklanabilir liste satirinin icinde yasiyor. Onsuz telefona basmak ayni
 * anda satiri secip haritayi kaydiriyor.
 */
export default function ContactLinks({
  tags,
  variant = "popup",
  emptyLabel,
}: ContactLinksProps) {
  const contact = extractContact(tags);

  if (!hasContact(contact)) {
    return emptyLabel ? (
      <p className="text-2xs text-ink-4">{emptyLabel}</p>
    ) : null;
  }

  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const compact = variant === "compact";

  const linkClass = [
    "group inline-flex items-center gap-1.5 min-w-0",
    "text-ink-2 hover:text-accent",
    "transition-colors duration-fast ease-out",
    compact ? "text-2xs max-w-[9.5rem]" : "text-xs",
  ].join(" ");

  const iconClass = "shrink-0 text-ink-4 group-hover:text-accent transition-colors duration-fast ease-out";
  const iconSize = compact ? 11 : 13;

  return (
    <div className={compact ? "flex flex-wrap items-center gap-x-3 gap-y-1" : "space-y-1.5"}>
      {contact.phone && (
        <a href={telHref(contact.phone)} onClick={stop} className={linkClass}>
          <Phone size={iconSize} className={iconClass} />
          {/* tabular: numaralar alt alta hizalansin - listede yirmi kayit
              tararken en cok ise yarayan sey bu. */}
          <span className="tabular truncate">{contact.phone}</span>
        </a>
      )}

      {contact.email && (
        <a href={mailtoHref(contact.email)} onClick={stop} className={linkClass}>
          <Mail size={iconSize} className={iconClass} />
          <span className="truncate">{contact.email}</span>
        </a>
      )}

      {contact.website && (
        <a
          href={websiteHref(contact.website)}
          onClick={stop}
          target="_blank"
          // noopener: yeni sekme window.opener uzerinden bu sayfayi
          // yonlendirebilir; disariya acilan her baglantida gerekli.
          rel="noopener noreferrer"
          className={linkClass}
        >
          <Globe size={iconSize} className={iconClass} />
          <span className="truncate">{websiteLabel(contact.website)}</span>
        </a>
      )}
    </div>
  );
}
