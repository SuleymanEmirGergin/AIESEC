"use client";

import React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, BookmarkCheck, Flag, SearchX } from "lucide-react";
import ContactLinks from "./ContactLinks";
import { PLACE_TYPE_LABELS } from "../lib/labels";
import type { Place } from "../lib/types";
import type { SortOption } from "../lib/districts";

/** Siralanabilir sutunlar: ilk tiklama ilk yon, ikinci tiklama ters yon. */
const SORT_COLUMNS = {
  name: ["name", "name_desc"],
  type: ["type", "type_desc"],
  contact: ["contact_first", "contact_last"],
} as const satisfies Record<string, readonly [SortOption, SortOption]>;

export type SortColumn = keyof typeof SORT_COLUMNS;

/** Sutuna tiklaninca uygulanacak siralama. */
export function nextSort(column: SortColumn, current: SortOption | undefined): SortOption {
  const [first, second] = SORT_COLUMNS[column];
  return current === first ? second : first;
}

interface ResultsTableProps {
  places: Place[];
  total: number;
  loading: boolean;
  loadingMore: boolean;
  savedIds: Set<string>;
  selected: Set<string>;
  onToggle: (id: string) => void;
  /** Yuklu satirlarin hepsini sec / birak. */
  onToggleAll: () => void;
  onLoadMore: () => void;
  onReport: (place: Place) => void;
  sort: SortOption | undefined;
  onSort: (column: SortColumn) => void;
}

/**
 * Tarama sonuclari, ekranin ana alaninda tablo olarak.
 *
 * Eskiden sonuclar dar kenar cubugunda kart listesiydi; bir ilcenin
 * yuzlerce kaydini orada taramak zordu. Kutucuk artik "sec" demek,
 * kaydetme yukaridaki butonlarla toplu yapiliyor.
 */
export default function ResultsTable({
  places,
  total,
  loading,
  loadingMore,
  savedIds,
  selected,
  onToggle,
  onToggleAll,
  onLoadMore,
  onReport,
  sort,
  onSort,
}: ResultsTableProps) {
  if (loading && places.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
        <span
          aria-hidden="true"
          className="h-6 w-6 animate-spin rounded-full border-2 border-rule border-t-accent"
        />
        <p className="mono-label">Taranıyor</p>
      </div>
    );
  }

  if (places.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <SearchX size={28} aria-hidden="true" strokeWidth={1.5} className="mb-3 text-ink-4" />
        <p className="max-w-xs text-sm text-ink-3">
          Bu filtrelerle sonuç yok. Soldaki koşulları gevşetmeyi deneyin.
        </p>
      </div>
    );
  }

  const allOn = places.every((p) => selected.has(p.id));

  return (
    <div className="h-full overflow-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="sticky top-0 z-10 bg-paper-2">
          <tr className="rule-b">
            <th className="w-10 px-3 py-2.5">
              <input
                type="checkbox"
                checked={allOn}
                onChange={onToggleAll}
                aria-label="Yüklü sonuçların hepsini seç"
                className="h-4 w-4 accent-accent"
              />
            </th>
            <SortHeader column="name" label="Ad" sort={sort} onSort={onSort} />
            <SortHeader column="type" label="Tür" sort={sort} onSort={onSort} className="hidden md:table-cell" />
            <SortHeader column="contact" label="İletişim" sort={sort} onSort={onSort} className="hidden lg:table-cell" />
            <th className="mono-label w-24 px-3 py-2.5 text-right">Durum</th>
          </tr>
        </thead>
        <tbody>
          {places.map((place) => (
            <Row
              key={place.id}
              place={place}
              isSaved={savedIds.has(place.id)}
              isSelected={selected.has(place.id)}
              onToggle={onToggle}
              onReport={onReport}
            />
          ))}
        </tbody>
      </table>

      {places.length < total && (
        <div className="px-3 py-4 text-center">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="btn btn--ghost px-4 py-2 text-xs disabled:opacity-50"
          >
            {loadingMore ? "Yükleniyor…" : `Daha fazla göster (${total - places.length} kayıt daha)`}
          </button>
        </div>
      )}
    </div>
  );
}

function SortHeader({
  column,
  label,
  sort,
  onSort,
  className = "",
}: {
  column: SortColumn;
  label: string;
  sort: SortOption | undefined;
  onSort: (column: SortColumn) => void;
  className?: string;
}) {
  const [first, second] = SORT_COLUMNS[column];
  const direction = sort === first ? "ascending" : sort === second ? "descending" : "none";
  const Icon = direction === "ascending" ? ArrowUp : direction === "descending" ? ArrowDown : ArrowUpDown;
  return (
    <th aria-sort={direction} className={`px-3 py-2.5 ${className}`}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`mono-label inline-flex items-center gap-1 transition-colors duration-fast ease-out hover:text-ink ${
          direction === "none" ? "" : "text-accent"
        }`}
      >
        {label}
        <Icon size={11} aria-hidden="true" className={direction === "none" ? "opacity-40" : ""} />
      </button>
    </th>
  );
}

/** Memo'lu: bir satiri secmek yalnizca o satiri yeniden ciziyor. */
const Row = React.memo(function Row({
  place,
  isSaved,
  isSelected,
  onToggle,
  onReport,
}: {
  place: Place;
  isSaved: boolean;
  isSelected: boolean;
  onToggle: (id: string) => void;
  onReport: (place: Place) => void;
}) {
  return (
    <tr
      onClick={() => onToggle(place.id)}
      className={`cursor-pointer rule-b align-top transition-colors duration-fast ease-out ${
        isSelected ? "bg-accent-wash" : "hover:bg-paper-2"
      }`}
    >
      <td className="px-3 py-3">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggle(place.id)}
          onClick={(e) => e.stopPropagation()}
          aria-label={`${place.name} seç`}
          className="h-4 w-4 accent-accent"
        />
      </td>
      <td className="px-3 py-3">
        <p className="font-medium leading-snug text-ink">{place.name}</p>
        {place.address && place.address !== "Adres bilgisi yok" && (
          <p className="mt-0.5 line-clamp-1 text-2xs text-ink-3">{place.address}</p>
        )}
        {/* Dar ekranda iletisim ve tur sutunlari gizli; ad altinda. */}
        <div className="mt-1 lg:hidden">
          <ContactLinks tags={place.tags} variant="compact" />
        </div>
      </td>
      <td className="hidden px-3 py-3 md:table-cell">
        <span className="mono-label">{PLACE_TYPE_LABELS[place.type] ?? place.type}</span>
      </td>
      <td className="hidden px-3 py-3 lg:table-cell" onClick={(e) => e.stopPropagation()}>
        <ContactLinks tags={place.tags} variant="compact" />
      </td>
      <td className="px-3 py-3 text-right">
        <div className="flex items-center justify-end gap-2">
          {isSaved && (
            <span className="inline-flex items-center gap-1 text-2xs font-medium text-positive">
              <BookmarkCheck size={12} aria-hidden="true" />
              Kayıtlı
            </span>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onReport(place);
            }}
            aria-label={`${place.name} için hata bildir`}
            className="rounded-input p-1 text-ink-4 transition-colors duration-fast ease-out hover:text-critical"
          >
            <Flag size={12} aria-hidden="true" />
          </button>
        </div>
      </td>
    </tr>
  );
});
