"use client";

import { FolderInput, Trash2, X } from "lucide-react";
import DownloadMenu from "../DownloadMenu";
import type { ExportFormat } from "../../lib/api";
import type { Assignee, ContactStatus } from "../../lib/savedApi";
import { addDays, CONTACT_STATUS_LABELS, localDateInputValue } from "../../lib/contactTracking";

interface BulkBarProps {
  count: number;
  members: Assignee[];
  busy: boolean;
  onStatus: (status: ContactStatus) => void;
  onAssign: (assignee: Assignee | null) => void;
  onFollowUp: (date: string | null) => void;
  onMove: () => void;
  onExport: (format: ExportFormat) => void;
  onDelete: () => void;
  onClear: () => void;
}

const selectClass =
  "rounded-input border border-white/30 bg-transparent px-2 py-1.5 text-xs text-paper [&>option]:text-ink";

/**
 * Secili kayitlara toplu islem seridi. Secim sayfalar arasinda korunuyor;
 * serit yalnizca secim varken gorunuyor ki ekran sade kalsin.
 */
export default function BulkBar({ count, members, busy, onStatus, onAssign, onFollowUp, onMove, onExport, onDelete, onClear }: BulkBarProps) {
  const today = localDateInputValue();
  return (
    <div role="toolbar" aria-label="Seçili kayıtlar" className="sticky top-0 z-20 flex flex-wrap items-center gap-2 bg-ink px-4 py-2.5 text-paper">
      <span className="mr-1 text-sm font-medium tabular">{count} seçili</span>

      <select aria-label="Durumu değiştir" disabled={busy} value="" onChange={(e) => e.target.value && onStatus(e.target.value as ContactStatus)} className={selectClass}>
        <option value="">Durum…</option>
        {Object.entries(CONTACT_STATUS_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      <select
        aria-label="Sorumlu ata"
        disabled={busy}
        value=""
        onChange={(e) => {
          const v = e.target.value;
          if (!v) return;
          onAssign(v === "__none__" ? null : members.find((m) => m.email === v) ?? null);
        }}
        className={selectClass}
      >
        <option value="">Sorumlu…</option>
        {members.map((m) => (
          <option key={m.email} value={m.email}>
            {m.name}
          </option>
        ))}
        <option value="__none__">Atamayı kaldır</option>
      </select>

      <select
        aria-label="Takip tarihi"
        disabled={busy}
        value=""
        onChange={(e) => {
          const v = e.target.value;
          if (v) onFollowUp(v === "__none__" ? null : v);
        }}
        className={selectClass}
      >
        <option value="">Takip…</option>
        <option value={today}>Bugün</option>
        <option value={addDays(today, 1)}>Yarın</option>
        <option value={addDays(today, 7)}>1 hafta sonra</option>
        <option value={addDays(today, 14)}>2 hafta sonra</option>
        <option value="__none__">Takibi kaldır</option>
      </select>

      <button type="button" disabled={busy} onClick={onMove} className="inline-flex items-center gap-1.5 rounded-input px-2.5 py-1.5 text-xs hover:bg-white/10">
        <FolderInput size={13} aria-hidden="true" />
        Listeye taşı
      </button>
      <DownloadMenu onSelect={onExport} disabled={busy} className="[&>button]:py-1.5 [&>button]:text-xs" />
      <button type="button" disabled={busy} onClick={onDelete} className="inline-flex items-center gap-1.5 rounded-input px-2.5 py-1.5 text-xs hover:bg-white/10" style={{ color: "#ffb4a8" }}>
        <Trash2 size={13} aria-hidden="true" />
        Sil
      </button>
      <button type="button" onClick={onClear} className="ml-auto inline-flex items-center gap-1 text-xs opacity-80 hover:opacity-100">
        <X size={13} aria-hidden="true" />
        Seçimi temizle
      </button>
    </div>
  );
}
