"use client";

import { Undo2, X } from "lucide-react";

interface UndoToastProps {
  message: string;
  onUndo: () => void;
  onClose: () => void;
}

/**
 * Silme gibi geri donusu olmayan islemler hemen uygulanmiyor: bir sure
 * bekliyor, bu surede "Geri al" islemi iptal ediyor. Yanlis tiklamada
 * notlar ve temas gecmisi kaybolmasin.
 */
export default function UndoToast({ message, onUndo, onClose }: UndoToastProps) {
  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 z-[1600] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-card bg-ink px-4 py-3 text-sm text-paper shadow-modal"
    >
      <span className="min-w-0 flex-1">{message}</span>
      <button
        type="button"
        onClick={onUndo}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-input px-2.5 py-1.5 font-medium text-accent-wash hover:bg-white/10"
        style={{ color: "#9cc4ff" }}
      >
        <Undo2 size={14} aria-hidden="true" />
        Geri al
      </button>
      <button type="button" onClick={onClose} aria-label="Kapat" className="shrink-0 opacity-70 hover:opacity-100">
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
