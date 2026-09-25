"use client";

import { Search } from "lucide-react";
import type { PlaceQuery, SortOption } from "@/lib/districts";

interface FilterPanelProps {
  value: PlaceQuery;
  onChange: (next: PlaceQuery) => void;
  /** Referans nokta yoksa mesafe siralamasi anlamsiz; secenek kapaniyor. */
  hasReferencePoint?: boolean;
}

const SORT_LABELS: { id: SortOption; label: string; note?: string }[] = [
  { id: "contact_first", label: "Önce iletişimi olanlar" },
  { id: "lead_score", label: "Lead kalitesi" },
  { id: "confidence", label: "Güven skoru" },
  { id: "name", label: "İsme göre (A→Z)" },
  { id: "name_desc", label: "İsme göre (Z→A)" },
  { id: "type", label: "Türe göre (A→Z)" },
  { id: "type_desc", label: "Türe göre (Z→A)" },
  { id: "contact_last", label: "Önce iletişimi olmayanlar" },
  { id: "ref_distance", label: "Referans noktaya uzaklık" },
];

/**
 * Filtre ve siralama kontrolleri.
 *
 * Her degisim aninda uygulaniyor - sorgu yerel SQLite'a gidiyor,
 * debounce'a gerek yok. Kontroller tek sutun: kenar cubugu dar ve
 * bunlar tarama degil karar araclari.
 */
export default function FilterPanel({
  value,
  onChange,
  hasReferencePoint = false,
}: FilterPanelProps) {
  const patch = (next: Partial<PlaceQuery>) => onChange({ ...value, ...next });

  return (
    <div className="rule-b bg-paper">
      <div className="flex items-baseline justify-between px-4 pt-4 pb-2">
        <h2 className="mono-label">Filtre</h2>
      </div>

      <div className="space-y-3 px-3 pb-3">
        <div className="relative">
          <label htmlFor="place-search" className="sr-only">
            İsimde ara
          </label>
          <Search
            size={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-4"
          />
          <input
            id="place-search"
            type="search"
            value={value.q ?? ""}
            onChange={(e) => patch({ q: e.target.value })}
            placeholder="İsimde ara"
            className="w-full rounded-input border border-rule-2 bg-paper py-2 pl-8 pr-3 text-xs text-ink placeholder:text-ink-4 transition-colors duration-fast ease-out hover:border-ink-4 focus:border-accent"
          />
        </div>

        <div>
          <label htmlFor="sort-select" className="mono-label mb-1 block">
            Sıralama
          </label>
          <select
            id="sort-select"
            value={value.sort ?? "contact_first"}
            onChange={(e) => patch({ sort: e.target.value as SortOption })}
            className="w-full rounded-input border border-rule-2 bg-paper px-2.5 py-2 text-xs text-ink transition-colors duration-fast ease-out hover:border-ink-4 focus:border-accent"
          >
            {SORT_LABELS.map(({ id, label }) => (
              <option
                key={id}
                value={id}
                // Referans nokta secilmeden mesafe siralamasi kayitlari
                // oldugu gibi dondurur; sessizce yanlis sira gostermek
                // yerine secenek kapali.
                disabled={id === "ref_distance" && !hasReferencePoint}
              >
                {label}
              </option>
            ))}
          </select>
          {value.sort === "ref_distance" && !hasReferencePoint && (
            <p className="field-note mt-1">
              Haritada bir referans noktası seçin.
            </p>
          )}
        </div>

        <fieldset className="space-y-2">
          <legend className="mono-label mb-1">Koşullar</legend>

          <Toggle
            id="has-contact"
            checked={!!value.hasContact}
            onChange={(checked) => patch({ hasContact: checked })}
            label="Sadece iletişim bilgisi olanlar"
          />
          <Toggle
            id="named-only"
            checked={!!value.namedOnly}
            onChange={(checked) => patch({ namedOnly: checked })}
            label="Sadece isimli kayıtlar"
          />
          <Toggle
            id="include-buffer"
            // Varsayilan true: 2 km tampon kullanicinin acik talebi,
            // sinirin hemen disindaki fabrika gecerli bir lead.
            checked={value.includeBuffer !== false}
            onChange={(checked) => patch({ includeBuffer: checked })}
            label="Sınır dışı 2 km'yi dahil et"
          />
          <Toggle
            id="include-unclassified"
            checked={!!value.includeUnclassified}
            onChange={(checked) => patch({ includeUnclassified: checked })}
            label="Sınıflandırılamayanları göster"
          />
        </fieldset>

        <div>
          <label htmlFor="min-confidence" className="mono-label mb-1 flex justify-between">
            <span>En düşük güven</span>
            <span className="tabular">{value.minConfidence ?? 0}</span>
          </label>
          <input
            id="min-confidence"
            type="range"
            min={0}
            max={100}
            step={10}
            value={value.minConfidence ?? 0}
            onChange={(e) => patch({ minConfidence: Number(e.target.value) })}
            className="w-full accent-accent"
          />
        </div>
      </div>
    </div>
  );
}

function Toggle({
  id,
  checked,
  onChange,
  label,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-center gap-2 text-xs text-ink-2 hover:text-ink transition-colors duration-fast ease-out"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 rounded-sm accent-accent"
      />
      <span>{label}</span>
    </label>
  );
}
