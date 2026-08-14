"use client";

import React, { useEffect, useState } from "react";
import { History, ChevronDown } from "lucide-react";
import { fetchExportHistory, type ExportHistoryItem } from "../lib/savedApi";
import { PLACE_TYPE_LABELS } from "../lib/labels";
import type { PlaceType } from "../lib/types";

const dateFormat = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Daha once alinmis CSV'ler.
 *
 * ExportLog tablosu bastan beri doluyordu ama hicbir uc onu okumuyordu -
 * veri birikiyor, kimse goremiyordu. Gonullu "gecen hafta neyi indirdim"
 * diye soramiyordu.
 *
 * Sayfanin tek koyu bandi (DESIGN.md: sayfa basina bir grafit bolge).
 * Varsayilan kapali: gecmis destekleyici bilgi, ana is degil - yogunluk
 * kazanilir (PRODUCT.md ilke 4).
 */
export default function ExportHistory() {
  const [items, setItems] = useState<ExportHistoryItem[] | null>(null);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetchExportHistory()
      .then(setItems)
      .catch(() => setFailed(true));
  }, []);

  // Hic indirme yapilmamissa serit hic gorunmuyor: bos bir "gecmis yok"
  // kutusu ekranda yer kaplamaktan baska bir sey yapmaz.
  if (failed || !items || items.length === 0) return null;

  return (
    <section className="shrink-0 bg-graphite text-graphite-ink">
      <h2 className="sr-only">Dışa aktarım geçmişi</h2>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors duration-fast ease-out hover:bg-graphite-2"
      >
        <History size={13} aria-hidden="true" className="text-graphite-ink-2" />
        <span className="mono-label text-graphite-ink-2">Önceki indirmeler</span>
        <span className="tabular text-2xs text-graphite-ink-2">{items.length}</span>
        <ChevronDown
          size={13}
          aria-hidden="true"
          className={`ml-auto text-graphite-ink-2 transition-transform duration-short ease-out ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <ul className="max-h-44 overflow-y-auto border-t border-graphite-2 px-4 py-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-baseline gap-3 py-1.5 text-2xs"
            >
              <span className="tabular shrink-0 text-graphite-ink-2">
                {dateFormat.format(new Date(item.created_at))}
              </span>
              <span className="truncate text-graphite-ink">
                {PLACE_TYPE_LABELS[item.type as PlaceType] ?? item.type}
              </span>
              <span className="tabular ml-auto shrink-0 text-graphite-ink-2">
                {item.item_count} kayıt
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
