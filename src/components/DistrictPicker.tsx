"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin, Search, AlertTriangle } from "lucide-react";
import {
  ageInDays,
  fetchDistricts,
  foldTr,
  groupByProvince,
  STALE_AFTER_DAYS,
  type DistrictMeta,
} from "@/lib/districts";

interface DistrictPickerProps {
  selectedId: string | null;
  onSelect: (district: DistrictMeta | null) => void;
}

/**
 * Konum secimi: once il chip'i, sonra ilce.
 *
 * Ilce sayisi 80. Haritada gozle "Pehlivankoy"u bulmak zor, yazmak iki
 * saniye - bu yuzden liste degil aranabilir bir alan. Il chip'i listeyi
 * daraltiyor, arama kutusu il secimini de asiyor (kullanici ilcenin
 * hangi ilde oldugunu bilmek zorunda kalmasin).
 */
export default function DistrictPicker({ selectedId, onSelect }: DistrictPickerProps) {
  const [districts, setDistricts] = useState<DistrictMeta[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [plate, setPlate] = useState<string | null>(null);
  const [term, setTerm] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchDistricts()
      .then(setDistricts)
      .catch((e) => setError(e?.message || "İlçe listesi alınamadı."));
  }, []);

  const provinces = useMemo(() => groupByProvince(districts), [districts]);

  const visible = useMemo(() => {
    // foldTr: kullanici "kadik" yazinca "Kadikoy" eslesmeli. Duz
    // toLocaleLowerCase("tr") noktasiz "ı" uretip eslesmeyi bozuyordu.
    const needle = foldTr(term.trim());

    // Arama yazildiginda il filtresi bilincli olarak devre disi:
    // kullanici ilcenin ilini bilmek zorunda degil.
    const pool = needle
      ? districts
      : plate
        ? districts.filter((d) => d.province_plate === plate)
        : [];

    if (!needle) return pool;
    return pool.filter((d) => foldTr(d.name).includes(needle));
  }, [districts, plate, term]);

  const selected = districts.find((d) => d.id === selectedId) ?? null;

  if (error) {
    return (
      <div className="rule-b bg-paper px-4 py-3">
        <p className="flex items-start gap-2 text-xs text-critical">
          <AlertTriangle size={14} className="mt-px shrink-0" />
          <span>{error}</span>
        </p>
      </div>
    );
  }

  return (
    <div className="rule-b bg-paper">
      <div className="flex items-baseline justify-between px-4 pt-4 pb-2">
        <h2 className="mono-label">Konum</h2>
        {selected && (
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="mono-label hover:text-ink transition-colors duration-fast ease-out"
          >
            Temizle
          </button>
        )}
      </div>

      {/* Il chip'leri: kapsamin ne oldugunu da gosteriyor. */}
      <div
        role="group"
        aria-label="İl seçimi"
        className="flex flex-wrap gap-1 px-3 pb-2"
      >
        {provinces.map(({ plate: p, province, districts: items }) => {
          const isActive = plate === p;
          return (
            <button
              key={p}
              type="button"
              aria-pressed={isActive}
              onClick={() => setPlate(isActive ? null : p)}
              className={`
                pressable rounded-input px-2.5 py-1.5 text-2xs font-medium capitalize
                transition-colors duration-fast ease-out
                ${isActive ? "bg-accent text-accent-ink" : "text-ink-2 hover:bg-paper-2 hover:text-ink"}
              `}
            >
              {province} <span className="tabular opacity-60">{items.length}</span>
            </button>
          );
        })}
      </div>

      <div className="px-3 pb-3">
        <label htmlFor="district-search" className="sr-only">
          İlçe ara
        </label>
        <div className="relative">
          <Search
            size={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-4"
          />
          <input
            id="district-search"
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={selected ? selected.name : "İlçe ara veya il seç"}
            className="w-full rounded-input border border-rule-2 bg-paper py-2 pl-8 pr-3 text-xs text-ink placeholder:text-ink-4 transition-colors duration-fast ease-out hover:border-ink-4 focus:border-accent"
          />
        </div>

        {visible.length > 0 && (
          <div
            ref={listRef}
            role="listbox"
            aria-label="İlçeler"
            className="mt-2 max-h-56 overflow-y-auto rounded-input border border-rule"
          >
            {visible.map((district) => {
              const isActive = district.id === selectedId;
              const age = ageInDays(district.fetched_at);
              const stale = age !== null && age > STALE_AFTER_DAYS;

              return (
                <button
                  key={district.id}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onClick={() => {
                    onSelect(district);
                    setTerm("");
                  }}
                  className={`
                    flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs
                    transition-colors duration-fast ease-out
                    ${isActive ? "bg-accent text-accent-ink" : "text-ink-2 hover:bg-paper-2 hover:text-ink"}
                  `}
                >
                  <MapPin size={12} className="shrink-0 opacity-60" />
                  <span className="min-w-0 flex-1 truncate">{district.name}</span>

                  {/*
                    Veri durumu satirda gorunuyor: kullanici tiklamadan
                    once o ilcenin cekilip cekilmedigini bilmeli, cunku
                    cekilmemis ilce ilk tiklamada ~30 sn beklemek demek.
                  */}
                  {district.fetched_at === null ? (
                    <span className="mono-label shrink-0 opacity-70">çekilmedi</span>
                  ) : stale ? (
                    <span className="mono-label shrink-0 text-caution">{age} gün</span>
                  ) : (
                    <span className="tabular shrink-0 text-2xs opacity-60">
                      {district.place_count ?? 0}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {term.trim() && visible.length === 0 && (
          <p className="field-note mt-2">Eşleşen ilçe yok.</p>
        )}

        {!term.trim() && !plate && (
          <p className="field-note mt-2">
            Kapsam: İstanbul, Edirne, Tekirdağ, Kırklareli, Malatya.
          </p>
        )}
      </div>
    </div>
  );
}
