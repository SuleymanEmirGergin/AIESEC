"use client";

import React from "react";
import {
  Factory,
  School,
  Baby,
  GraduationCap,
  Briefcase,
  Wrench,
} from "lucide-react";
import type { PlaceType } from "../lib/types";
import { PLACE_TYPE_LABELS } from "../lib/labels";

interface FiltersProps {
  selectedCategory: PlaceType | null;
  onCategoryChange: (category: PlaceType | null) => void;
}

/**
 * Map / Diagram macrostructure'inda kenar cubugu haritanin *lejanti*.
 * Kategoriler bu yuzden sayfa basligi gibi degil, bir lejant gibi
 * davraniyor: kucuk, yogun, tek sutunda taranabilir.
 *
 * Onceden dokuz kategori genis "hap" butonlar halinde sariyordu ve 320px
 * kenar cubugunda dort satir kapliyordu. Iki sutunlu siki bir izgara ayni
 * bilgiyi yarim yerde veriyor, geri kalani sonuc listesine kaliyor.
 */
/**
 * Etiketler burada tekrar yazilmiyor: PLACE_TYPE_LABELS tek kaynak.
 * Onceden ayni dokuz Turkce ad hem burada hem lib/labels.ts icinde
 * duruyordu ve birini duzeltmek digerini sessizce eskitiyordu.
 * Burada yalnizca siralama ve ikon esleme tutuluyor.
 */
const CATEGORY_ICONS: Record<PlaceType, typeof Factory> = {
  factory: Factory,
  office: Briefcase,
  // Onceden atolye de Factory ikonunu kullaniyordu; iki farkli kategori
  // ayni sembolle gosterilince birbirinden ayirt edilemiyordu.
  workshop: Wrench,
  kindergarten: Baby,
  primary_school: School,
  middle_school: School,
  high_school: GraduationCap,
  private_school: School,
  // Kolej (ozel K-12) ile universite ayri turler; ikisi de mezuniyet
  // sembolu tasiyor ama kategori listesinde adlariyla ayrisiyorlar.
  college_keyword: GraduationCap,
  college_university: GraduationCap,
};

/** Isletmeler once, egitim kurumlari sonra - arama niyetiyle ayni sira. */
const CATEGORY_ORDER: PlaceType[] = [
  "factory",
  "office",
  "workshop",
  "kindergarten",
  "primary_school",
  "middle_school",
  "high_school",
  "private_school",
  "college_keyword",
  "college_university",
];

export default function Filters({ selectedCategory, onCategoryChange }: FiltersProps) {
  return (
    <div className="rule-b bg-paper">
      <div className="flex items-baseline justify-between px-4 pt-4 pb-2">
        <h2 className="mono-label">Kategori</h2>
        {selectedCategory && (
          <button
            type="button"
            onClick={() => onCategoryChange(null)}
            className="mono-label hover:text-ink transition-colors duration-fast ease-out"
          >
            Temizle
          </button>
        )}
      </div>

      {/*
        role="group" + aria-label: ekran okuyucu bunu dokuz bagimsiz buton
        yerine tek bir kategori secici olarak duyuruyor.
      */}
      <div
        role="group"
        aria-label="Yer kategorisi seçimi"
        className="grid grid-cols-2 gap-1 px-3 pb-3"
      >
        {CATEGORY_ORDER.map((id) => {
          const Icon = CATEGORY_ICONS[id];
          const isActive = selectedCategory === id;

          return (
            <button
              key={id}
              type="button"
              // aria-pressed: secim durumu gorsel olarak renkle anlatiliyor,
              // ekran okuyucunun da ayni bilgiye erismesi gerek.
              aria-pressed={isActive}
              onClick={() => onCategoryChange(isActive ? null : id)}
              className={`
                pressable group flex items-center gap-2 rounded-input px-2.5 py-2 text-left
                text-xs font-medium
                transition-colors duration-fast ease-out
                ${
                  isActive
                    ? "bg-accent text-accent-ink"
                    : "text-ink-2 hover:bg-paper-2 hover:text-ink"
                }
              `}
            >
              <Icon
                size={14}
                className={`shrink-0 ${isActive ? "text-accent-ink" : "text-ink-4 group-hover:text-ink-3"}`}
              />
              {/* truncate: "Üniversite" dar sutunda tasabiliyor; buton
                  metni iki satira sarmamali, dokunma hedefi bolunur. */}
              <span className="truncate">{PLACE_TYPE_LABELS[id]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
