"use client";

import type { PlaceType } from "../lib/types";
import { PLACE_TYPE_GROUPS, PLACE_TYPE_LABELS } from "../lib/labels";

interface CategoryFilterProps {
  /** Secili turler. Bos dizi = filtre yok, hepsi geliyor. */
  value: PlaceType[];
  onChange: (types: PlaceType[]) => void;
  /**
   * Ilcedeki tur basina kayit sayisi (`/summary` ucundan). Verilmezse
   * sayilar gosterilmez; panel yine calisir.
   */
  counts?: Record<PlaceType, number>;
}

/**
 * Tur secimi.
 *
 * Coklu secim: kullanici "tum okul turlerini" tek bakista gormek
 * istiyor, tek secim bunu imkansiz kilardi. Bos secim "hepsi" demek --
 * ayrica bir "Tumu" secenegi yok, cunku "hicbiri secili degil" ile
 * "hepsi secili" ayni sonucu vermeli ve iki ayri durum tutmak
 * kullaniciya da bize de yalan soylerdi.
 *
 * Sayilar `/summary`den geliyor ve secimden BAGIMSIZ: bunlar ilcenin
 * envanteri, o anki sorgunun sonucu degil. Secime gore degisselerdi
 * kullanici bir turu kapatinca digerlerinin sayisi da degisir, "kac
 * tane var" sorusu cevapsiz kalirdi.
 */
export default function CategoryFilter({
  value,
  onChange,
  counts,
}: CategoryFilterProps) {
  const selected = new Set(value);

  const toggle = (type: PlaceType) => {
    const next = new Set(selected);
    next.has(type) ? next.delete(type) : next.add(type);
    onChange([...next]);
  };

  const toggleGroup = (types: PlaceType[]) => {
    const allOn = types.every((t) => selected.has(t));
    const next = new Set(selected);
    types.forEach((t) => (allOn ? next.delete(t) : next.add(t)));
    onChange([...next]);
  };

  return (
    <div className="rule-b bg-paper">
      <div className="flex items-baseline justify-between px-4 pt-4 pb-2">
        <h2 className="mono-label">Kategori</h2>
        {selected.size > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="mono-label text-accent transition-colors duration-fast ease-out hover:text-accent-hover"
          >
            Temizle
          </button>
        )}
      </div>

      <div className="space-y-3 px-3 pb-3">
        {Object.entries(PLACE_TYPE_GROUPS).map(([groupName, types]) => {
          const allOn = types.every((t) => selected.has(t));
          return (
            <div key={groupName}>
              <button
                type="button"
                onClick={() => toggleGroup(types)}
                className="mono-label mb-1 block text-ink-3 transition-colors duration-fast ease-out hover:text-accent"
                aria-pressed={allOn}
              >
                {groupName}
              </button>

              <div className="flex flex-wrap gap-1">
                {types.map((type) => {
                  const on = selected.has(type);
                  const n = counts?.[type];
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => toggle(type)}
                      aria-pressed={on}
                      // Kaydi olmayan tur tiklanabilir kalmali degil:
                      // secilince bos liste doner, kullanici filtreyi
                      // yanlis sanir.
                      disabled={n === 0}
                      className={`
                        inline-flex items-center gap-1.5 rounded-input border px-2 py-1
                        text-2xs transition-colors duration-fast ease-out
                        disabled:cursor-not-allowed disabled:opacity-40
                        ${
                          on
                            ? "border-accent bg-accent-wash text-accent"
                            : "border-rule-2 bg-paper text-ink-2 hover:border-ink-4"
                        }
                      `}
                    >
                      <span>{PLACE_TYPE_LABELS[type]}</span>
                      {n !== undefined && (
                        <span className="tabular text-ink-4">{n}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
