"use client";

import { useState } from "react";
import { SlidersHorizontal, Search, X } from "lucide-react";
import type { Assignee, PlaceListSummary } from "../../lib/savedApi";
import { CONTACT_STATUS_LABELS } from "../../lib/contactTracking";
import { PLACE_TYPE_LABELS } from "../../lib/labels";
import { ALL_LISTS, EMPTY_FILTER, type SavedFilter } from "../../lib/savedFilters";
import type { PlaceType } from "../../lib/types";

interface SavedToolbarProps {
  filter: SavedFilter;
  onChange: (next: SavedFilter) => void;
  lists: PlaceListSummary[];
  members: Assignee[];
  districts: { id: string; name: string }[];
  savers: string[];
  types: PlaceType[];
}

const selectClass =
  "min-w-0 rounded-input border border-rule-2 bg-paper px-2 py-1.5 text-xs text-ink hover:border-ink-4 focus:border-accent";

/**
 * Arama ve filtreler tek satirda. Liste secimi burada da var: dar ekranda
 * soldaki liste rayi gizli, telefonda listeye buradan geciliyor.
 */
export default function SavedToolbar({ filter, onChange, lists, members, districts, savers, types }: SavedToolbarProps) {
  const set = <K extends keyof SavedFilter>(key: K, value: SavedFilter[K]) => onChange({ ...filter, [key]: value });
  const active = JSON.stringify({ ...filter, listId: ALL_LISTS }) !== JSON.stringify({ ...EMPTY_FILTER, listId: ALL_LISTS });
  // Telefonda filtreler katlanir: yedi acilir liste ekranin yarisini yiyordu.
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-2 rule-b px-4 py-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <label htmlFor="saved-search" className="sr-only">
            Kayıtlarda ara
          </label>
          <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
          <input
            id="saved-search"
            type="search"
            value={filter.q}
            onChange={(e) => set("q", e.target.value)}
            placeholder="Ad, telefon, not, ilçe ya da kişi ara"
            className="w-full rounded-input border border-rule-2 bg-paper py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-4 hover:border-ink-4 focus:border-accent"
          />
        </div>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className={`btn btn--ghost shrink-0 px-3 sm:hidden ${active ? "text-accent" : ""}`}
        >
          <SlidersHorizontal size={14} aria-hidden="true" />
          Filtre{active ? " •" : ""}
        </button>
      </div>

      <div className={`${open ? "flex" : "hidden"} flex-wrap items-center gap-2 sm:flex`}>
        <select aria-label="Liste" value={filter.listId} onChange={(e) => set("listId", e.target.value)} className={`${selectClass} lg:hidden`}>
          <option value={ALL_LISTS}>Tüm listeler</option>
          <option value="unfiled">Dosyalanmamış</option>
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <select aria-label="Sorumlu" value={filter.assignee} onChange={(e) => set("assignee", e.target.value)} className={selectClass}>
          <option value="">Sorumlu: herkes</option>
          <option value="me">Bana atananlar</option>
          <option value="none">Atanmamış</option>
          {members.map((m) => (
            <option key={m.email} value={m.email}>
              {m.name}
            </option>
          ))}
        </select>
        <select aria-label="Durum" value={filter.status} onChange={(e) => set("status", e.target.value as SavedFilter["status"])} className={selectClass}>
          <option value="">Durum: hepsi</option>
          {Object.entries(CONTACT_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select aria-label="Takip" value={filter.followUp} onChange={(e) => set("followUp", e.target.value as SavedFilter["followUp"])} className={selectClass}>
          <option value="">Takip: hepsi</option>
          <option value="overdue">Gecikmiş</option>
          <option value="today">Bugün</option>
          <option value="week">7 gün içinde</option>
        </select>
        <select aria-label="İlçe" value={filter.district} onChange={(e) => set("district", e.target.value)} className={selectClass}>
          <option value="">İlçe: hepsi</option>
          {districts.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Tür"
          value={filter.types[0] ?? ""}
          onChange={(e) => set("types", e.target.value ? [e.target.value as PlaceType] : [])}
          className={selectClass}
        >
          <option value="">Tür: hepsi</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {PLACE_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <select aria-label="Kaydeden" value={filter.savedBy} onChange={(e) => set("savedBy", e.target.value)} className={selectClass}>
          <option value="">Kaydeden: herkes</option>
          {savers.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {active && (
          <button
            type="button"
            onClick={() => onChange({ ...EMPTY_FILTER, listId: filter.listId })}
            className="inline-flex items-center gap-1 text-xs text-accent hover:text-accent-hover"
          >
            <X size={12} aria-hidden="true" />
            Filtreleri temizle
          </button>
        )}
      </div>
    </div>
  );
}
