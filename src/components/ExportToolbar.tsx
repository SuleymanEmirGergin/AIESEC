"use client";

import Link from "next/link";
import { Download, BookmarkPlus, AlertTriangle } from "lucide-react";

interface ExportToolbarProps {
  /** Ekrandaki sonuclar icinden kac tanesi kayitli. */
  savedCount: number;
  totalResults: number;
  onSaveAll: () => void;
  onExport: () => void;
  /**
   * Doluysa indirme devre disi ve sebep gosteriliyor.
   * Kullanici basip 403/429 almadan once durumu bilsin diye.
   */
  exportBlockedReason?: string | null;
  quotaRemaining?: number | null;
  isExporting?: boolean;
  isSavingAll?: boolean;
}

/** Sunucu 1000 ustunu reddediyor (sessizce kirpmiyor). */
const MAX_EXPORT_ITEMS = 1000;

/**
 * Sayfanin tek koyu bandi.
 *
 * Model degisti: eskiden gecici bir "secim sepeti" vardi ve bir "Temizle"
 * butonu onu bosaltiyordu. Artik secim diye bir sey yok - yerler dogrudan
 * kaydediliyor ve kalici. Dolayisiyla temizleme butonu da kaldirildi;
 * bir kaydi kaldirmanin yeri artik satirin kendisi ya da Kayitli sayfasi.
 */
export default function ExportToolbar({
  savedCount,
  totalResults,
  onSaveAll,
  onExport,
  exportBlockedReason,
  quotaRemaining,
  isExporting,
  isSavingAll,
}: ExportToolbarProps) {
  if (totalResults === 0) return null;

  const overLimit = savedCount > MAX_EXPORT_ITEMS;
  const disabled = savedCount === 0 || !!exportBlockedReason || !!isExporting || overLimit;
  const allSaved = savedCount >= totalResults;

  const blockNote = overLimit
    ? `${MAX_EXPORT_ITEMS} kaydı aşıyor; sunucu reddeder.`
    : exportBlockedReason;

  return (
    <div className="shrink-0 bg-graphite text-graphite-ink">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3">
        <div className="flex items-baseline gap-2">
          <span className="tabular text-lg font-medium leading-none text-graphite-ink">
            {savedCount}
          </span>
          <span className="tabular text-2xs text-graphite-ink-2">
            / {totalResults} kayıtlı
          </span>
        </div>

        <button
          type="button"
          onClick={onSaveAll}
          disabled={allSaved || !!isSavingAll}
          className="inline-flex items-center gap-1.5 rounded-input px-2.5 py-1.5 text-2xs font-medium text-graphite-ink-2 transition-colors duration-fast ease-out hover:bg-graphite-2 hover:text-graphite-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <BookmarkPlus size={12} aria-hidden="true" />
          {isSavingAll ? "Ekleniyor…" : allSaved ? "Hepsi kayıtlı" : "Hepsini kaydet"}
        </button>

        <div className="ml-auto flex items-center gap-3">
          {/* Gerekce butonun yaninda, title'da degil: dokunmatik cihazda
              hover ipucu diye bir sey yok. */}
          {blockNote && (
            <p className="flex max-w-[18rem] items-center gap-1.5 text-2xs text-caution-on-dark">
              <AlertTriangle size={12} aria-hidden="true" className="shrink-0" />
              <span>{blockNote}</span>
            </p>
          )}

          {!blockNote && typeof quotaRemaining === "number" && quotaRemaining < 50 && (
            <p className="mono-label tabular text-caution-on-dark">
              {quotaRemaining} hak kaldı
            </p>
          )}

          <Link
            href="/kayitli"
            className="mono-label text-graphite-ink-2 transition-colors duration-fast ease-out hover:text-graphite-ink"
          >
            Kayıtlılar
          </Link>

          <button
            type="button"
            onClick={onExport}
            disabled={disabled}
            className="btn btn--primary px-4 py-2 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download size={14} aria-hidden="true" />
            {isExporting ? "Hazırlanıyor…" : "CSV indir"}
          </button>
        </div>
      </div>
    </div>
  );
}
