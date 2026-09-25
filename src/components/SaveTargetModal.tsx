"use client";

import { useEffect, useState } from "react";
import { FolderPlus, Inbox, List } from "lucide-react";
import ModalShell from "./ModalShell";
import { fetchLists, type PlaceListSummary } from "../lib/savedApi";

/** Kullanicinin secimi: mevcut liste, yeni liste adi ya da dosyalanmamis. */
export type SaveTarget =
  | { kind: "unfiled" }
  | { kind: "list"; listId: string }
  | { kind: "new"; name: string };

interface SaveTargetModalProps {
  isOpen: boolean;
  /** Kac yer kaydedilecek; baslikta gosteriliyor. */
  count: number;
  onClose: () => void;
  onConfirm: (target: SaveTarget) => void;
}

const LAST_LIST_KEY = "last_save_list";

function readLastList(): string | null {
  try {
    return localStorage.getItem(LAST_LIST_KEY);
  } catch {
    return null;
  }
}

/** Son kaydedilen listeyi varsayilan yap. Yeni liste icin cagiran, id belli olunca cagiriyor. */
export function rememberList(listId: string | null) {
  try {
    if (listId) localStorage.setItem(LAST_LIST_KEY, listId);
    else localStorage.removeItem(LAST_LIST_KEY);
  } catch {
    // Tarayici depolamasi kapaliysa yalnizca varsayilan hatirlanmaz.
  }
}

/**
 * Toplu kayitta hedefi soran pencere.
 *
 * Eskiden toplu kayit hep "dosyalanmamis"a dusuyordu ve her seferinde
 * Kayitli sayfasinda tek tek tasimak gerekiyordu. Son secilen liste
 * varsayilan geliyor: ayni listeye ard arda kayit yaygin durum.
 */
export default function SaveTargetModal({ isOpen, count, onClose, onConfirm }: SaveTargetModalProps) {
  const [lists, setLists] = useState<PlaceListSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [choice, setChoice] = useState<string>("unfiled"); // "unfiled" | "new" | liste id
  const [newName, setNewName] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    let alive = true;
    setLists(null);
    setLoadError(null);
    setNewName("");
    fetchLists()
      .then((items) => {
        if (!alive) return;
        setLists(items);
        const last = readLastList();
        setChoice(last && items.some((l) => l.id === last) ? last : "unfiled");
      })
      .catch((err: any) => {
        if (!alive) return;
        setLists([]);
        setLoadError(err?.message || "Listeler okunamadı.");
      });
    return () => {
      alive = false;
    };
  }, [isOpen]);

  const trimmedName = newName.trim();
  const canConfirm = choice !== "new" || trimmedName.length > 0;

  const confirm = () => {
    if (!canConfirm) return;
    if (choice === "unfiled") {
      rememberList(null);
      onConfirm({ kind: "unfiled" });
    } else if (choice === "new") {
      onConfirm({ kind: "new", name: trimmedName });
    } else {
      rememberList(choice);
      onConfirm({ kind: "list", listId: choice });
    }
  };

  const option = (value: string, label: React.ReactNode, icon: React.ReactNode, meta?: string) => (
    <label
      key={value}
      className={`flex cursor-pointer items-center gap-3 rounded-input border px-3 py-2.5 transition-colors duration-fast ease-out ${
        choice === value ? "border-accent bg-accent-wash" : "border-rule hover:bg-paper-2"
      }`}
    >
      <input
        type="radio"
        name="save-target"
        value={value}
        checked={choice === value}
        onChange={() => setChoice(value)}
        className="accent-[var(--color-accent)]"
      />
      <span className="text-ink-3" aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-ink">{label}</span>
      {meta && <span className="mono-label tabular">{meta}</span>}
    </label>
  );

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      eyebrow={`${count} yer`}
      title="Nereye kaydedelim?"
      widthClass="max-w-md"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          confirm();
        }}
        className="space-y-4"
      >
        <div className="max-h-[50vh] space-y-2 overflow-y-auto" role="radiogroup">
          {option("unfiled", "Dosyalanmamış", <Inbox size={15} />)}

          {lists === null && <p className="mono-label px-1 py-2">Listeler yükleniyor…</p>}
          {loadError && <p className="px-1 text-2xs text-critical">{loadError}</p>}
          {lists?.map((l) => option(l.id, l.name, <List size={15} />, `${l.place_count}`))}

          {option("new", "Yeni liste oluştur", <FolderPlus size={15} />)}
          {choice === "new" && (
            <input
              autoFocus
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={120}
              placeholder="Liste adı, ör. Kadıköy liseleri"
              aria-label="Yeni liste adı"
              className="w-full rounded-input border border-rule bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
          )}
        </div>

        <div className="flex justify-end gap-2 rule-t pt-4">
          <button type="button" onClick={onClose} className="btn btn--ghost px-4 py-2 text-sm">
            Vazgeç
          </button>
          <button
            type="submit"
            disabled={!canConfirm}
            className="btn btn--primary px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
          >
            Kaydet
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
