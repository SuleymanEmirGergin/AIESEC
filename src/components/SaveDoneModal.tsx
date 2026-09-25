"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Download, FileSpreadsheet, FileText, FileType } from "lucide-react";
import ModalShell from "./ModalShell";
import type { ExportFormat } from "../lib/api";

interface SaveDoneModalProps {
  isOpen: boolean;
  /** Kaydedilen yer sayisi. */
  count: number;
  /** Nereye kaydedildi: liste adi ya da "Dosyalanmamış". */
  destination: string;
  exporting: boolean;
  onExport: (format: ExportFormat) => void;
  onClose: () => void;
}

const FORMATS: { format: ExportFormat; label: string; hint: string; icon: typeof FileText }[] = [
  { format: "xlsx", label: "Excel", hint: "Filtreli tablo", icon: FileSpreadsheet },
  { format: "pdf", label: "PDF", hint: "Paylaşmaya hazır", icon: FileText },
  { format: "csv", label: "CSV", hint: "Düz veri", icon: FileType },
];

/**
 * Kayit bitince: "indirmek ister misin?"
 *
 * Evet -> bicim secimi (PDF/Excel/CSV). Hayir -> pencere kapanir; hemen
 * yaninda Kayitlilar'a gitme secenegi var. Indirme kaydedilen kayitlarin
 * AYNISINI iceriyor, ekrandaki filtreye gore yeniden hesaplanmiyor.
 */
export default function SaveDoneModal({
  isOpen,
  count,
  destination,
  exporting,
  onExport,
  onClose,
}: SaveDoneModalProps) {
  const [wantsDownload, setWantsDownload] = useState(false);

  useEffect(() => {
    if (isOpen) setWantsDownload(false);
  }, [isOpen]);

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      eyebrow={`${count} yer · ${destination}`}
      title="Kaydedildi"
      widthClass="max-w-md"
    >
      {!wantsDownload ? (
        <div className="space-y-5">
          <p className="text-sm text-ink-2">Kaydettiğiniz yerleri şimdi indirmek ister misiniz?</p>
          <div className="flex flex-wrap items-center gap-2 rule-t pt-4">
            <Link href="/kayitli" className="btn btn--ghost px-3 py-2 text-sm">
              Kayıtlılar’a git
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
            <button type="button" onClick={onClose} className="btn btn--ghost ml-auto px-4 py-2 text-sm">
              Hayır
            </button>
            <button
              type="button"
              autoFocus
              onClick={() => setWantsDownload(true)}
              className="btn btn--primary px-4 py-2 text-sm"
            >
              <Download size={14} aria-hidden="true" />
              Evet, indir
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-ink-2">Hangi biçimde indirelim?</p>
          <div className="grid grid-cols-3 gap-2">
            {FORMATS.map(({ format, label, hint, icon: Icon }) => (
              <button
                key={format}
                type="button"
                disabled={exporting}
                onClick={() => onExport(format)}
                className="flex flex-col items-center gap-1.5 rounded-card border border-rule px-2 py-4 text-center transition-colors duration-fast ease-out hover:border-accent hover:bg-accent-wash disabled:cursor-wait disabled:opacity-50"
              >
                <Icon size={20} aria-hidden="true" className="text-accent" />
                <span className="text-sm font-medium text-ink">{label}</span>
                <span className="text-2xs text-ink-3">{hint}</span>
              </button>
            ))}
          </div>
          {exporting && <p className="mono-label">Dosya hazırlanıyor…</p>}
          <div className="flex items-center gap-2 rule-t pt-4">
            <Link href="/kayitli" className="btn btn--ghost px-3 py-2 text-sm">
              Kayıtlılar’a git
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
            <button type="button" onClick={onClose} className="btn btn--ghost ml-auto px-4 py-2 text-sm">
              Kapat
            </button>
          </div>
        </div>
      )}
    </ModalShell>
  );
}
