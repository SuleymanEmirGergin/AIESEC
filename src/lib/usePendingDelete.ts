"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bulkDeleteSaved, bulkDeleteSavedOnExit } from "./savedApi";

/** "Geri al" suresi. */
export const UNDO_MS = 8000;

/**
 * Silmeyi bekleten kanca: kayitlar hemen ekrandan kalkar ama sunucuya
 * UNDO_MS sonra gider; bu arada "Geri al" hepsini geri koyar. Sayfa
 * kapanirken bekleyen silme keepalive istegiyle yine de gonderilir.
 */
export function usePendingDelete<T extends { id: string }>(opts: {
  onRemoveLocal: (ids: Set<string>) => void;
  onRestoreLocal: (items: T[]) => void;
  onCommitted: () => void;
  onError: (message: string) => void;
}) {
  const pending = useRef<T[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const commit = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const items = pending.current;
    pending.current = [];
    setToast(null);
    if (!items.length) return;
    try {
      await bulkDeleteSaved(items.map((i) => i.id));
      optsRef.current.onCommitted();
    } catch (err: any) {
      optsRef.current.onRestoreLocal(items);
      optsRef.current.onError(err?.message || "Kayıtlar silinemedi; geri getirildi.");
    }
  }, []);

  const remove = useCallback(
    (items: T[]) => {
      if (!items.length) return;
      // Onceki bekleyen silme varsa onu simdi kesinlestir; ikisi karismasin.
      if (pending.current.length) void commit();
      pending.current = items;
      optsRef.current.onRemoveLocal(new Set(items.map((i) => i.id)));
      setToast(items.length === 1 ? "Kayıt silindi." : `${items.length} kayıt silindi.`);
      timer.current = setTimeout(() => void commit(), UNDO_MS);
    },
    [commit]
  );

  const undo = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const items = pending.current;
    pending.current = [];
    setToast(null);
    optsRef.current.onRestoreLocal(items);
  }, []);

  useEffect(() => {
    const flush = () => {
      if (!pending.current.length) return;
      bulkDeleteSavedOnExit(pending.current.map((i) => i.id));
      pending.current = [];
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush(); // sayfa icinde baska ekrana gecis (unmount)
    };
  }, []);

  return { toast, remove, undo, dismiss: commit };
}
