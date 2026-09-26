"use client";

import { Mail, MessageCircle, Phone } from "lucide-react";
import { extractContact, mailtoHref, telHref, whatsappHref } from "../lib/contact";

/**
 * Telefonda tek dokunusla arama/WhatsApp/e-posta. Sahadaki gonullu
 * numarayi kopyalamakla ugrasmasin. Masaustunde kucuk baglantilar yeterli
 * oldugu icin cagiran bunu genelde yalniz dar ekranda gosteriyor.
 */
export default function QuickActions({ tags, className = "" }: { tags?: Record<string, string>; className?: string }) {
  const contact = extractContact(tags);
  const wa = contact.phone ? whatsappHref(contact.phone) : null;
  if (!contact.phone && !contact.email) return null;
  const btn = "inline-flex flex-1 items-center justify-center gap-1.5 rounded-input border border-rule-2 px-3 py-2.5 text-sm font-medium text-ink active:bg-paper-3";
  return (
    <div className={`flex gap-2 ${className}`}>
      {contact.phone && (
        <a href={telHref(contact.phone)} className={btn}>
          <Phone size={15} aria-hidden="true" className="text-accent" />
          Ara
        </a>
      )}
      {wa && (
        <a href={wa} target="_blank" rel="noopener noreferrer" className={btn}>
          <MessageCircle size={15} aria-hidden="true" className="text-positive" />
          WhatsApp
        </a>
      )}
      {contact.email && (
        <a href={mailtoHref(contact.email)} className={btn}>
          <Mail size={15} aria-hidden="true" className="text-accent" />
          E-posta
        </a>
      )}
    </div>
  );
}
