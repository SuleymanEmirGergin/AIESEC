"use client";

import { Download, CheckSquare, Square, X } from "lucide-react";

interface ExportToolbarProps {
  selectedCount: number;
  totalResults: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onExport: () => void;
}

export default function ExportToolbar({
  selectedCount,
  totalResults,
  onSelectAll,
  onClearSelection,
  onExport,
}: ExportToolbarProps) {
  if (totalResults === 0) return null;

  return (
    <div className="mb-6 animate-in slide-in-from-top-4">
      <div className="bg-slate-900 text-white rounded-2xl shadow-xl p-4 lg:p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <div className="flex flex-col">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Seçili Veri</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black">{selectedCount}</span>
              <span className="text-[10px] text-slate-500 font-bold">/ {totalResults}</span>
            </div>
          </div>

          <div className="h-10 w-px bg-slate-800 hidden sm:block" />

          <div className="flex items-center gap-2">
            <button
              onClick={onSelectAll}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold flex items-center gap-2 transition-all border border-white/10"
            >
              <CheckSquare className="w-4 h-4" />
              Tümünü Seç
            </button>
            <button
              onClick={onClearSelection}
              disabled={selectedCount === 0}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold flex items-center gap-2 transition-all border border-white/10 disabled:opacity-30"
            >
              <X className="w-4 h-4" />
              Temizle
            </button>
          </div>
        </div>

        <button
          onClick={onExport}
          disabled={selectedCount === 0}
          className="flex-1 sm:flex-none flex items-center justify-center gap-3 px-8 py-4 bg-primary text-white font-black rounded-2xl shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 disabled:shadow-none"
        >
          <Download className="w-5 h-5" />
          CSV OLARAK İNDİR
        </button>
      </div>

      {selectedCount > 1000 && (
        <div className="mt-4 p-4 bg-rose-50 dark:bg-rose-900/20 border-2 border-rose-100 dark:border-rose-900/40 rounded-2xl flex items-center gap-3 text-rose-600 dark:text-rose-400">
          <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
          {/* Sunucu 1000 ustunu reddediyor (sessizce kirpmiyor); uyari bunu yansitiyor. */}
          <p className="text-xs font-bold uppercase tracking-tight">
            Dikkat: 1000 kayıt sınırını aştınız. Dışa aktarım reddedilecek, lütfen seçimi azaltın.
          </p>
        </div>
      )}
    </div>
  );
}
