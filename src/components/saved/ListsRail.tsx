"use client";

import React, { useState } from "react";
import { Plus, Trash2, UserRound } from "lucide-react";
import type { PlaceListSummary } from "../../lib/savedApi";
import { ALL_LISTS } from "../../lib/savedFilters";

interface ListsRailProps {
  lists: PlaceListSummary[];
  activeList: string;
  mineActive: boolean;
  counts: { all: number; unfiled: number; mine: number; byList: Record<string, number> };
  onSelectList: (id: string) => void;
  onToggleMine: () => void;
  onCreate: (name: string) => Promise<boolean>;
  onDelete: (id: string) => void;
}

const item = (active: boolean) =>
  `group flex w-full items-center gap-2 rounded-input px-2.5 py-2 text-left text-xs font-medium transition-colors duration-fast ease-out ${
    active ? "bg-accent text-accent-ink" : "text-ink-2 hover:bg-paper-2 hover:text-ink"
  }`;

/** Masaustunde sol ray: listeler ve "Bana atananlar". Dar ekranda gizli (filtre satirinda secilir). */
export default function ListsRail({ lists, activeList, mineActive, counts, onSelectList, onToggleMine, onCreate, onDelete }: ListsRailProps) {
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || creating) return;
    setCreating(true);
    if (await onCreate(name.trim())) setName("");
    setCreating(false);
  };

  return (
    <aside className="hidden w-64 shrink-0 flex-col overflow-hidden border-r border-rule bg-paper lg:flex">
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        <div className="space-y-1">
          <button type="button" onClick={onToggleMine} className={item(mineActive)}>
            <UserRound size={13} aria-hidden="true" className="shrink-0" />
            <span className="truncate">Bana atananlar</span>
            <span className="tabular ml-auto text-2xs opacity-70">{counts.mine}</span>
          </button>
        </div>
        <div className="space-y-1 border-t border-rule pt-3">
          <p className="mono-label px-1 pb-1">Listeler</p>
          <button type="button" onClick={() => onSelectList(ALL_LISTS)} className={item(activeList === ALL_LISTS)}>
            <span className="truncate">Tüm kayıtlar</span>
            <span className="tabular ml-auto text-2xs opacity-70">{counts.all}</span>
          </button>
          {counts.unfiled > 0 && (
            <button type="button" onClick={() => onSelectList("unfiled")} className={item(activeList === "unfiled")}>
              <span className="truncate">Dosyalanmamış</span>
              <span className="tabular ml-auto text-2xs opacity-70">{counts.unfiled}</span>
            </button>
          )}
          {lists.map((list) => (
            <div key={list.id} className="flex items-center gap-1">
              <button type="button" onClick={() => onSelectList(list.id)} className={item(activeList === list.id)}>
                <span className="truncate">{list.name}</span>
                <span className="tabular ml-auto text-2xs opacity-70">{counts.byList[list.id] ?? 0}</span>
              </button>
              {pendingDelete === list.id ? (
                <button
                  type="button"
                  onClick={() => {
                    setPendingDelete(null);
                    onDelete(list.id);
                  }}
                  className="shrink-0 rounded-input px-2 py-1 text-2xs font-medium text-critical hover:bg-paper-2"
                >
                  Onayla
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setPendingDelete(list.id)}
                  aria-label={`${list.name} listesini sil`}
                  className="shrink-0 rounded-input p-1.5 text-ink-4 transition-colors duration-fast ease-out hover:bg-paper-2 hover:text-critical"
                >
                  <Trash2 size={12} aria-hidden="true" />
                </button>
              )}
            </div>
          ))}
        </div>

        <form onSubmit={create} className="border-t border-rule pt-3">
          <label className="sr-only" htmlFor="new-list">
            Yeni liste adı
          </label>
          <div className="flex gap-1.5">
            <input
              id="new-list"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Yeni liste"
              maxLength={120}
              className="min-w-0 flex-1 rounded-input border border-rule-2 bg-paper px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-4 hover:border-ink-4 focus:border-accent"
            />
            <button type="submit" disabled={!name.trim() || creating} aria-label="Liste oluştur" className="btn btn--ghost shrink-0 px-2.5 py-1.5">
              <Plus size={13} aria-hidden="true" />
            </button>
          </div>
          <p className="mt-1.5 text-2xs leading-relaxed text-ink-4">Liste silinince içindekiler Dosyalanmamış&apos;a geçer.</p>
        </form>
      </div>
    </aside>
  );
}
