"use client";

import { Download, CheckSquare, X, AlertTriangle } from "lucide-react";

interface ExportToolbarProps {
  selectedCount: number;
  totalResults: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onExport: () => void;
  /**
   * Doluysa export butonu devre disi ve sebep gosteriliyor.
   * Kullanici basip 403/429 almadan once durumu bilsin diye.
   */
  exportBlockedReason?: string | null;
  /** Kalan gunluk kota; bilinmiyorsa gosterilmiyor. */
  quotaRemaining?: number | null;
  isExporting?: boolean;
}

/** Sunucu 1000 ustunu reddediyor (sessizce kirpmiyor). */
const MAX_EXPORT_ITEMS = 1000;

/**
 * Sayfanin tek koyu bandi.
 *
 * Onceden haritanin USTUNDE duran acik renkli bir kart seridiydi; sonuc
 * gelince beliriyor ve haritayi asagi itiyordu - kullanici tam sonuclara
 * bakarken zemin kayiyordu. Artik harita panelinin altina doklenmis bir
 * grafit bant: harita tam yuksekligini koruyor, eylem seridi de dikkatin
 * zaten bulundugu yerde duruyor.
 */
export default function ExportToolbar({
  selectedCount,
  totalResults,
  onSelectAll,
  onClearSelection,
  onExport,
  exportBlockedReason,
  quotaRemaining,
  isExporting,
}: ExportToolbarProps) {
  if (totalResults === 0) return null;

  const overLimit = selectedCount > MAX_EXPORT_ITEMS;
  const disabled =
    selectedCount === 0 || !!exportBlockedReason || !!isExporting || overLimit;

  // Buton devre disiysa sebebi tek yerden turetiliyor; onceden gerekce
  // yalnizca title'da duruyordu ve dokunmatik cihazda hic gorunmuyordu.
  const blockNote = overLimit
    ? `Seçim ${MAX_EXPORT_ITEMS} kaydı aşıyor; sunucu reddeder.`
    : exportBlockedReason;

  return (
    <div className="shrink-0 bg-graphite text-graphite-ink">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3">
        <div className="flex items-baseline gap-2">
          <span className="tabular text-lg font-medium leading-none text-graphite-ink">
            {selectedCount}
          </span>
          <span className="tabular text-2xs text-graphite-ink-2">
            / {totalResults} seçili
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onSelectAll}
            className="inline-flex items-center gap-1.5 rounded-input px-2.5 py-1.5 text-2xs font-medium text-graphite-ink-2 hover:bg-graphite-2 hover:text-graphite-ink transition-colors duration-fast ease-out"
          >
            <CheckSquare size={12} />
            Tümü
          </button>
          <button
            type="button"
            onClick={onClearSelection}
            disabled={selectedCount === 0}
            className="inline-flex items-center gap-1.5 rounded-input px-2.5 py-1.5 text-2xs font-medium text-graphite-ink-2 hover:bg-graphite-2 hover:text-graphite-ink transition-colors duration-fast ease-out disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
          >
            <X size={12} />
            Temizle
          </button>
        </div>

        <div className="ml-auto flex items-center gap-3">
          {/* Gerekce butonun yaninda, title'da degil: dokunmatik cihazda
              hover ipucu diye bir sey yok. */}
          {blockNote && (
            <p className="flex items-center gap-1.5 text-2xs text-caution-on-dark max-w-[18rem]">
              <AlertTriangle size={12} className="shrink-0" />
              <span>{blockNote}</span>
            </p>
          )}

          {!blockNote && typeof quotaRemaining === "number" && (
            <p className="mono-label tabular text-graphite-ink-2">
              Kota {quotaRemaining} · indirme 2 birim
            </p>
          )}

          <button
            type="button"
            onClick={onExport}
            disabled={disabled}
            className="btn btn--primary px-4 py-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download size={14} />
            {isExporting ? "Hazırlanıyor…" : "CSV indir"}
          </button>
        </div>
      </div>
    </div>
  );
}
