"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Download, FileSpreadsheet, FileText, FileType } from "lucide-react";
import type { ExportFormat } from "../lib/api";

interface DownloadMenuProps {
  onSelect: (format: ExportFormat) => void;
  disabled?: boolean;
  busy?: boolean;
  /** Koyu seritte (ExportToolbar) menu yukari acilir; sayfa basinda asagi. */
  openUp?: boolean;
  className?: string;
}

const OPTIONS: { format: ExportFormat; label: string; hint: string; icon: typeof FileText }[] = [
  { format: "xlsx", label: "Excel", hint: "Filtreli tablo, tıklanabilir bağlantılar", icon: FileSpreadsheet },
  { format: "pdf", label: "PDF", hint: "Paylaşmaya ve yazdırmaya hazır liste", icon: FileText },
  { format: "csv", label: "CSV", hint: "Başka sistemlere aktarım için düz veri", icon: FileType },
];

/**
 * "CSV indir" butonunun yerini aliyor: ayni kayitlar uc bicimde.
 * Excel basta - gonullulerin cogu dosyayi Excel'de aciyor.
 */
export default function DownloadMenu({ onSelect, disabled, busy, openUp, className = "" }: DownloadMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled || busy}
        aria-haspopup="menu"
        aria-expanded={open}
        className="btn btn--primary px-4 py-2 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Download size={14} aria-hidden="true" />
        {busy ? "Hazırlanıyor…" : "İndir"}
        <ChevronDown size={13} aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute right-0 z-[1500] w-64 overflow-hidden rounded-card border border-rule-2 bg-paper py-1 text-ink shadow-modal ${
            openUp ? "bottom-full mb-2" : "top-full mt-2"
          }`}
        >
          {OPTIONS.map(({ format, label, hint, icon: Icon }) => (
            <button
              key={format}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onSelect(format);
              }}
              className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors duration-fast ease-out hover:bg-paper-2"
            >
              <Icon size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-accent" />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{label}</span>
                <span className="block text-2xs text-ink-3">{hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
