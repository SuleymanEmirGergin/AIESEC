"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, CalendarClock, FolderOpen, Search } from "lucide-react";
import AppHeader from "../../components/AppHeader";
import SavedPlaceRow from "../../components/SavedPlaceRow";
import ExportHistory from "../../components/ExportHistory";
import DownloadMenu from "../../components/DownloadMenu";
import UndoToast from "../../components/UndoToast";
import SaveTargetModal, { rememberList, type SaveTarget } from "../../components/SaveTargetModal";
import ListsRail from "../../components/saved/ListsRail";
import SavedToolbar from "../../components/saved/SavedToolbar";
import BulkBar from "../../components/saved/BulkBar";
import Pagination from "../../components/saved/Pagination";
import { downloadBlob, exportLeads, fetchAccount, type ExportFormat } from "../../lib/api";
import { ALL_LISTS, EMPTY_FILTER, filterSaved, followUpBucket, paginate, type SavedFilter } from "../../lib/savedFilters";
import { usePendingDelete } from "../../lib/usePendingDelete";
import type { PlaceType } from "../../lib/types";
import {
  addContactEvent,
  bulkUpdateSaved,
  createList,
  deleteList,
  fetchLists,
  fetchMembers,
  fetchSavedPlaces,
  moveSavedPlaces,
  savedToPlace,
  updateSavedPlace,
  type Assignee,
  type ContactEventCreate,
  type ContactStatus,
  type PlaceListSummary,
  type SavedPlace,
} from "../../lib/savedApi";

/** Bir sayfada cizilen kayit. 2.000 satiri birden cizmek 4 sn / 140 MB tutuyordu. */
const PAGE_SIZE = 50;

/** URL'den baslangic filtresi: Bugun ekrani ve e-posta buradan baglanti veriyor. */
function filterFromUrl(): Partial<SavedFilter> {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const out: Partial<SavedFilter> = {};
  if (params.get("sorumlu") === "ben") out.assignee = "me";
  if (params.get("sorumlu") === "yok") out.assignee = "none";
  const takip = params.get("takip");
  if (takip === "gecikmis") out.followUp = "overdue";
  if (takip === "bugun") out.followUp = "today";
  if (takip === "hafta") out.followUp = "week";
  const ara = params.get("ara");
  if (ara) out.q = ara;
  return out;
}

export default function SavedPage() {
  const [lists, setLists] = useState<PlaceListSummary[]>([]);
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [members, setMembers] = useState<Assignee[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<SavedFilter>(EMPTY_FILTER);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const [nextLists, nextPlaces] = await Promise.all([fetchLists(), fetchSavedPlaces()]);
      setLists(nextLists);
      setPlaces(nextPlaces);
    } catch (err: any) {
      setError(err?.message || "Kayıtlar yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setFilter((f) => ({ ...f, ...filterFromUrl() }));
    reload();
    fetchAccount().then((a) => setMe(a?.email ?? null));
    fetchMembers().then(setMembers).catch(() => setMembers([]));
  }, [reload]);

  const refreshLists = useCallback(() => {
    fetchLists().then(setLists).catch(() => undefined);
  }, []);

  const deleter = usePendingDelete<SavedPlace>({
    onRemoveLocal: (ids) => {
      setPlaces((prev) => prev.filter((p) => !ids.has(p.id)));
      setSelected((prev) => new Set([...prev].filter((id) => !ids.has(id))));
    },
    onRestoreLocal: (items) => setPlaces((prev) => [...prev, ...items].sort((a, b) => b.created_at.localeCompare(a.created_at))),
    onCommitted: refreshLists,
    onError: setError,
  });

  const today = useMemo(() => new Date(), []);
  const visible = useMemo(() => filterSaved(places, filter, me, today), [places, filter, me, today]);
  const paged = paginate(visible, page, PAGE_SIZE);

  // Filtre degisince ilk sayfaya don.
  useEffect(() => setPage(1), [filter]);

  const options = useMemo(() => {
    const districts = new Map<string, string>();
    const savers = new Set<string>();
    const types = new Set<PlaceType>();
    for (const p of places) {
      if (p.district_id && p.district_name) districts.set(p.district_id, p.district_name);
      if (p.saved_by) savers.add(p.saved_by);
      if (p.place_type) types.add(p.place_type as PlaceType);
    }
    return {
      districts: [...districts].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "tr")),
      savers: [...savers].sort((a, b) => a.localeCompare(b, "tr")),
      types: [...types],
    };
  }, [places]);

  const counts = useMemo(() => {
    const byList: Record<string, number> = {};
    let unfiled = 0;
    let mine = 0;
    for (const p of places) {
      if (p.list_id) byList[p.list_id] = (byList[p.list_id] ?? 0) + 1;
      else unfiled += 1;
      if (me && p.assigned_to === me) mine += 1;
    }
    return { all: places.length, unfiled, mine, byList };
  }, [places, me]);

  const due = useMemo(() => {
    let overdue = 0;
    let todayCount = 0;
    for (const p of places) {
      const b = followUpBucket(p, today);
      if (b === "overdue") overdue += 1;
      if (b === "today") todayCount += 1;
    }
    return { overdue, today: todayCount };
  }, [places, today]);

  const title =
    filter.assignee === "me"
      ? "Bana atananlar"
      : filter.listId === ALL_LISTS
        ? "Tüm kayıtlar"
        : filter.listId === "unfiled"
          ? "Dosyalanmamış"
          : lists.find((l) => l.id === filter.listId)?.name ?? "Liste";

  // --- tekil islemler (callback'ler sabit: satirlar memo'lu) ---

  const patchLocal = useCallback((id: string, changes: Partial<SavedPlace>) => {
    setPlaces((prev) => prev.map((p) => (p.id === id ? { ...p, ...changes } : p)));
  }, []);

  const handleNote = useCallback(
    async (id: string, note: string) => {
      patchLocal(id, { note });
      try {
        await updateSavedPlace(id, { note });
      } catch (err: any) {
        setError(err?.message || "Not kaydedilemedi.");
        reload();
      }
    },
    [patchLocal, reload]
  );

  const handleMove = useCallback(
    async (id: string, listId: string | null) => {
      patchLocal(id, { list_id: listId });
      try {
        await updateSavedPlace(id, { list_id: listId });
        refreshLists();
      } catch (err: any) {
        setError(err?.message || "Kayıt taşınamadı.");
        reload();
      }
    },
    [patchLocal, refreshLists, reload]
  );

  const handleAssign = useCallback(
    async (id: string, assignee: Assignee | null) => {
      try {
        const updated = await updateSavedPlace(id, { assignee });
        // Sunucu ilce alanlarini PATCH cevabinda gondermiyor; yereldekileri koru.
        const { district_id: _d, district_name: _n, ...rest } = updated;
        patchLocal(id, rest);
      } catch (err: any) {
        setError(err?.message || "Sorumlu atanamadı.");
      }
    },
    [patchLocal]
  );

  const handleAddContact = useCallback(
    async (id: string, data: ContactEventCreate) => {
      const updated = await addContactEvent(id, data);
      const { district_id: _d, district_name: _n, ...rest } = updated;
      patchLocal(id, rest);
      window.dispatchEvent(new Event("rota:due")); // menudeki Bugun rozeti
    },
    [patchLocal]
  );

  const removeLater = deleter.remove;
  const placesRef = React.useRef(places);
  placesRef.current = places;
  const handleRemove = useCallback(
    (id: string) => {
      const item = placesRef.current.find((p) => p.id === id);
      if (item) removeLater([item]);
    },
    [removeLater]
  );

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // --- toplu islemler ---

  const selectedPlaces = useMemo(() => places.filter((p) => selected.has(p.id)), [places, selected]);

  const runBulk = async (action: () => Promise<unknown>, fallback: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await reload();
    } catch (err: any) {
      setError(err?.message || fallback);
    } finally {
      setBusy(false);
    }
  };

  const bulkStatus = (status: ContactStatus) => runBulk(() => bulkUpdateSaved([...selected], { contact_status: status }), "Durum güncellenemedi.");
  const bulkAssign = (assignee: Assignee | null) => runBulk(() => bulkUpdateSaved([...selected], { assignee }), "Sorumlu atanamadı.");
  const bulkFollowUp = (date: string | null) =>
    runBulk(() => bulkUpdateSaved([...selected], { next_follow_up_at: date }), "Takip tarihi ayarlanamadı.");

  const bulkMove = async (target: SaveTarget) => {
    setMoveOpen(false);
    await runBulk(async () => {
      let listId: string | null = null;
      if (target.kind === "list") listId = target.listId;
      if (target.kind === "new") {
        listId = (await createList(target.name)).id;
        rememberList(listId);
      }
      await moveSavedPlaces([...selected], listId);
    }, "Kayıtlar taşınamadı.");
  };

  const exportPlaces = async (items: SavedPlace[], name: string, format: ExportFormat) => {
    if (!items.length || exporting) return;
    setExporting(true);
    setError(null);
    try {
      const blob = await exportLeads(items.map(savedToPlace), { type: items[0]?.place_type || "kayitli", radius: 0, format, title: name });
      downloadBlob(blob, name, format);
    } catch (err: any) {
      setError(err?.message || "Dışa aktarım başarısız oldu.");
    } finally {
      setExporting(false);
    }
  };

  const allVisibleSelected = visible.length > 0 && visible.every((p) => selected.has(p.id));

  return (
    <main className="flex h-screen flex-col bg-paper text-ink-2">
      <AppHeader savedCount={places.length} />

      {error && (
        <div className="shrink-0 rule-b bg-caution-bg">
          <p className="flex items-start gap-2 px-4 py-2 text-xs text-caution">
            <AlertCircle size={13} className="mt-px shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </p>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <ListsRail
          lists={lists}
          activeList={filter.listId}
          mineActive={filter.assignee === "me"}
          counts={counts}
          onSelectList={(id) => setFilter((f) => ({ ...f, listId: id, assignee: f.assignee === "me" ? "" : f.assignee }))}
          onToggleMine={() => setFilter((f) => ({ ...f, assignee: f.assignee === "me" ? "" : "me", listId: ALL_LISTS }))}
          onCreate={async (name) => {
            try {
              const created = await createList(name);
              await reload();
              setFilter((f) => ({ ...f, listId: created.id }));
              return true;
            } catch (err: any) {
              setError(err?.message || "Liste oluşturulamadı.");
              return false;
            }
          }}
          onDelete={async (id) => {
            try {
              await deleteList(id);
              if (filter.listId === id) setFilter((f) => ({ ...f, listId: ALL_LISTS }));
              await reload();
            } catch (err: any) {
              setError(err?.message || "Liste silinemedi.");
            }
          }}
        />

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 flex-wrap items-center gap-3 rule-b px-4 py-3">
            <div className="min-w-0">
              <h1 className="font-display text-lg font-semibold leading-tight text-ink">{title}</h1>
              <p className="mono-label tabular mt-0.5">{visible.length} kayıt</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelected(allVisibleSelected ? new Set() : new Set(visible.map((p) => p.id)))}
                disabled={!visible.length}
                className="btn btn--ghost px-3 py-2 text-xs disabled:opacity-40"
              >
                {allVisibleSelected ? "Seçimi kaldır" : `Tümünü seç (${visible.length})`}
              </button>
              <DownloadMenu onSelect={(f) => exportPlaces(visible, title, f)} disabled={!visible.length} busy={exporting} />
            </div>
          </div>

          <SavedToolbar
            filter={filter}
            onChange={setFilter}
            lists={lists}
            members={members}
            districts={options.districts}
            savers={options.savers}
            types={options.types}
          />

          {(due.overdue > 0 || due.today > 0) && (
            <Link href="/bugun" className="flex shrink-0 items-center gap-2 rule-b bg-caution-bg px-4 py-2 text-xs text-caution hover:underline">
              <CalendarClock size={13} aria-hidden="true" />
              {due.today > 0 && `Bugün aranacak ${due.today} kurum`}
              {due.today > 0 && due.overdue > 0 && " · "}
              {due.overdue > 0 && `${due.overdue} gecikmiş takip`}
              <span className="ml-auto font-medium">Bugün ekranına git →</span>
            </Link>
          )}

          {selected.size > 0 && (
            <BulkBar
              count={selected.size}
              members={members}
              busy={busy}
              onStatus={bulkStatus}
              onAssign={bulkAssign}
              onFollowUp={bulkFollowUp}
              onMove={() => setMoveOpen(true)}
              onExport={(f) => exportPlaces(selectedPlaces, `${title} (seçili)`, f)}
              onDelete={() => deleter.remove(selectedPlaces)}
              onClear={() => setSelected(new Set())}
            />
          )}

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center p-10">
                <span className="mono-label">Yükleniyor</span>
              </div>
            ) : visible.length === 0 ? (
              <div className="mx-auto max-w-md px-6 py-14 text-center">
                <FolderOpen size={26} aria-hidden="true" strokeWidth={1.5} className="mx-auto mb-4 text-ink-4" />
                <h2 className="font-display text-sm font-semibold text-ink">
                  {places.length === 0 ? "Henüz kayıtlı yer yok" : "Bu filtreyle kayıt yok"}
                </h2>
                <p className="mt-2 text-xs leading-relaxed text-ink-3">
                  {places.length === 0
                    ? "Arama ekranında bir ilçe tarayın, ilgilendiğiniz kurumları kaydedin. Kaydettikleriniz burada birikir."
                    : "Filtreleri gevşetin ya da aramayı değiştirin."}
                </p>
                {places.length === 0 && (
                  <Link href="/" className="btn btn--primary mt-5 inline-flex px-4 py-2">
                    <Search size={13} aria-hidden="true" />
                    Aramaya git
                  </Link>
                )}
              </div>
            ) : (
              <>
                <ul>
                  {paged.items.map((place) => (
                    <SavedPlaceRow
                      key={place.id}
                      place={place}
                      lists={lists}
                      members={members}
                      selected={selected.has(place.id)}
                      onToggleSelect={toggleSelect}
                      onSaveNote={handleNote}
                      onMove={handleMove}
                      onAssign={handleAssign}
                      onRemove={handleRemove}
                      onAddContact={handleAddContact}
                      onHistoryError={setError}
                    />
                  ))}
                </ul>
                <Pagination page={paged.page} pages={paged.pages} total={visible.length} size={PAGE_SIZE} onPage={setPage} />
              </>
            )}
            <ExportHistory />
          </div>
        </div>
      </div>

      <SaveTargetModal
        isOpen={moveOpen}
        count={selected.size}
        countLabel="kayıt"
        title="Nereye taşıyalım?"
        confirmLabel="Taşı"
        onClose={() => setMoveOpen(false)}
        onConfirm={bulkMove}
      />

      {deleter.toast && <UndoToast message={deleter.toast} onUndo={deleter.undo} onClose={() => void deleter.dismiss()} />}
    </main>
  );
}
