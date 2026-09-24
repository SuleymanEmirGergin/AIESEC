"use client";

import React from "react";
import { MapPin, CheckSquare, Square, Flag } from "lucide-react";
import ContactLinks from "./ContactLinks";
import type { Place } from "../lib/types";
import { PLACE_TYPE_LABELS } from "../lib/labels";

interface PlaceListProps {
  places: Place[];
  loading: boolean;
  onPlaceClick: (id: string) => void;
  selectedPlaceId?: string;
  /**
   * Disa aktarim icin secili kayitlarin id'leri. Verilmezse secim
   * arayuzu hic gosterilmez; bilesen eskisi gibi calisir.
   */
  checkedIds?: Set<string>;
  onToggleCheck?: (place: Place) => void;
  onReport?: (place: Place) => void;
}

export default function PlaceList({
  places,
  loading,
  onPlaceClick,
  selectedPlaceId,
  checkedIds,
  onToggleCheck,
  onReport,
}: PlaceListProps) {
  if (loading && places.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="flex flex-col items-center gap-3">
          {/* Tek hareket ogesi: donen hairline. Iskelet kartlar burada
              yaniltici olurdu - kac sonuc gelecegi bilinmiyor. */}
          <span aria-hidden="true" className="w-5 h-5 rounded-full border-2 border-rule border-t-accent animate-spin" />
          <p className="mono-label">Aranıyor</p>
        </div>
      </div>
    );
  }

  if (places.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <MapPin size={28} aria-hidden="true" className="mb-3 text-ink-4" strokeWidth={1.5} />
        <p className="text-xs text-ink-3 leading-relaxed max-w-[16rem]">
          Sonuç yok. Haritayı kaydırın, yakınlaştırın ya da başka bir kategori seçin.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex-1 overflow-y-auto">
      {places.map((place) => {
        const isSelected = selectedPlaceId === place.id;
        const isChecked = checkedIds?.has(place.id) ?? false;

        return (
          <li key={place.id} className="rule-b last:border-b-0">
            <div
              onClick={() => onPlaceClick(place.id)}
              className={`
                relative px-4 py-3 cursor-pointer
                transition-colors duration-fast ease-out
                ${isSelected ? "bg-accent-wash" : "hover:bg-paper-2"}
              `}
            >
              {/* Secili satirin isareti sol kenardaki 2px aksan cizgisi.
                  Onceden bunun icin border-l-4 kullaniliyordu ve secim
                  degistikce tum satir icerigi 4px kayiyordu. Mutlak
                  konumlandirma metni yerinde tutuyor. */}
              {isSelected && (
                <span
                  aria-hidden="true"
                  className="absolute left-0 top-0 bottom-0 w-[2px] bg-accent"
                />
              )}

              <div className="flex items-start gap-2.5 min-w-0">
                {onToggleCheck && (
                  // Secim, satira tiklamaktan ayri tutuluyor: tiklamak
                  // haritada odakliyor, kutucuk ise disa aktarima ekliyor.
                  <button
                    type="button"
                    aria-label={`${place.name} kaydını dışa aktarıma ekle`}
                    aria-pressed={isChecked}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleCheck(place);
                    }}
                    className={`mt-0.5 shrink-0 transition-colors duration-fast ease-out ${
                      isChecked ? "text-accent" : "text-ink-4 hover:text-ink-2"
                    }`}
                  >
                    {isChecked ? <CheckSquare size={15} /> : <Square size={15} />}
                  </button>
                )}

                <div className="min-w-0 flex-1">
                  <h3 className="font-display text-sm font-medium text-ink leading-snug line-clamp-2">
                    {place.name}
                  </h3>

                  {place.address && place.address !== "Adres bilgisi yok" && (
                    <p className="mt-0.5 text-2xs text-ink-3 line-clamp-1">
                      {place.address}
                    </p>
                  )}

                  {/* Iletisim bilgisi listede de gorunuyor: kullanici her
                      kaydi haritada tek tek acmadan hangilerinin
                      ulasilabilir oldugunu gorebilmeli - secim ve disa
                      aktarim karari buna dayaniyor. */}
                  <div className="mt-1.5">
                    <ContactLinks tags={place.tags} variant="compact" />
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    {/* Onceden burada ham `place.type` versal olarak
                        basiliyordu ve listede "OFFİCE", "PRIMARY_SCHOOL"
                        gibi Ingilizce anahtar degerler goruluyordu. */}
                    <span className="mono-label">
                      {PLACE_TYPE_LABELS[place.type] ?? place.type}
                    </span>

                    {typeof place.distance_m === "number" && (
                      <span className="mono-label tabular">
                        {place.distance_m < 1000
                          ? `${Math.round(place.distance_m)} m`
                          : `${(place.distance_m / 1000).toFixed(1)} km`}
                      </span>
                    )}

                    {onReport && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onReport(place);
                        }}
                        className="ml-auto inline-flex items-center gap-1 text-2xs font-medium text-ink-4 hover:text-critical transition-colors duration-fast ease-out"
                      >
                        <Flag size={10} />
                        Bildir
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
