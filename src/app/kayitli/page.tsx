"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Download, FolderOpen, Trash2, AlertCircle, Search } from "lucide-react";
import { getDueFollowUps, isOverdue } from "../../lib/contactTracking";
import AppHeader from "../../components/AppHeader";
import SavedPlaceRow from "../../components/SavedPlaceRow";
import SettingsModal from "../../components/SettingsModal";
import ExportHistory from "../../components/ExportHistory";
import CategoryFilter from "../../components/CategoryFilter";
import { PLACE_TYPE_LABELS } from "../../lib/labels";
import type { PlaceType } from "../../lib/types";
import { fetchAccount, exportLeads } from "../../lib/api";
import type { AccountInfo } from "../../lib/api";
import {
  createList,
  addContactEvent,
  deleteList,
  fetchLists,
  fetchSavedPlaces,
  removeSavedPlace,
  savedToPlace,
  updateSavedPlace,
  type PlaceListSummary,
  type SavedPlace,
} from "../../lib/savedApi";

/** Sanal listeler: gercek bir kaydi yok, filtre gorevi goruyorlar. */
const ALL = "__all__";
const UNFILED = "unfiled";

export default function SavedPage() {
  const [lists, setLists] = useState<PlaceListSummary[]>([]);
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [activeList, setActiveList] = useState<string>(ALL);
  const [typeFilter, setTypeFilter] = useState<PlaceType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      // Ikisi paralel: liste sayilari ile yerler ayni anda geliyor,
      // sirali beklemek ekrani iki kez bos gosterirdi.
      const [nextLists, nextPlaces] = await Promise.all([
        fetchLists(),
        fetchSavedPlaces(),
      ]);
      setLists(nextLists);
      setPlaces(nextPlaces);
    } catch (err: any) {
      setError(err?.message || "Kayıtlar yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    fetchAccount().then(setAccount);
  }, [reload]);

  /**
   * Filtreleme istemcide: tum kayitlar zaten yuklu ve liste degistirmek
   * her seferinde sunucuya gitmeyi hak etmiyor. Kayit sayisi bir ekibin
   * biriktirebilecegi olcekte (yuzler), binler degil.
   */
  // Liste filtresi; tur sayaclari bunun uzerinden hesaplaniyor.
  const inList = useMemo(() => {
    if (activeList === ALL) return places;
    if (activeList === UNFILED) return places.filter((p) => !p.list_id);
    return places.filter((p) => p.list_id === activeList);
  }, [places, activeList]);

  // Listedeki tur envanteri, tur secimden BAGIMSIZ (CategoryFilter'in
  // harita sayfasindaki kuraliyla ayni). 16 anahtarin hepsi dolu: eksik
  // anahtar "sayi yok" ile "sifir" ayrimini bozar.
  const typeCounts = useMemo(() => {
    const counts = Object.fromEntries(
      (Object.keys(PLACE_TYPE_LABELS) as PlaceType[]).map((t) => [t, 0])
    ) as Record<PlaceType, number>;
    for (const p of inList) {
      if (p.place_type && p.place_type in counts) counts[p.place_type as PlaceType] += 1;
    }
    return counts;
  }, [inList]);

  const visible = useMemo(() => {
    if (typeFilter.length === 0) return inList;
    const wanted = new Set<string>(typeFilter);
    return inList.filter((p) => p.place_type && wanted.has(p.place_type));
  }, [inList, typeFilter]);

  const unfiledCount = useMemo(
    () => places.filter((p) => !p.list_id).length,
    [places]
  );
  const dueFollowUps = useMemo(() => getDueFollowUps(places, new Date()), [places]);

  const activeListName =
    activeList === ALL
      ? "Tüm kayıtlar"
      : activeList === UNFILED
        ? "Dosyalanmamış"
        : lists.find((l) => l.id === activeList)?.name ?? "Liste";

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newListName.trim();
    if (!name || creating) return;
    setCreating(true);
    setError(null);
    try {
      const created = await createList(name);
      setNewListName("");
      setActiveList(created.id);
      await reload();
    } catch (err: any) {
      if (err?.message === "Gönüllü adınızı Ayarlar'dan girin.") {
        setSettingsOpen(true);
        setError("Liste oluşturmak için önce Ayarlar’dan gönüllü adınızı girin.");
      } else setError(err?.message || "Liste oluşturulamadı.");
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteList = async (id: string) => {
    setError(null);
    try {
      await deleteList(id);
      setPendingDelete(null);
      if (activeList === id) setActiveList(ALL);
      await reload();
    } catch (err: any) {
      setError(err?.message || "Liste silinemedi.");
    }
  };

  const handleNote = async (id: string, note: string) => {
    // Iyimser guncelleme: not yazmak anlik hissetmeli. Hata olursa
    // reload gercek durumu geri getiriyor.
    setPlaces((prev) => prev.map((p) => (p.id === id ? { ...p, note } : p)));
    try {
      await updateSavedPlace(id, { note });
    } catch (err: any) {
      setError(err?.message || "Not kaydedilemedi.");
      reload();
    }
  };

  const handleMove = async (id: string, listId: string | null) => {
    setPlaces((prev) =>
      prev.map((p) => (p.id === id ? { ...p, list_id: listId } : p))
    );
    try {
      await updateSavedPlace(id, { list_id: listId });
      // Liste sayilari degisti; yalnizca listeleri tazele.
      setLists(await fetchLists());
    } catch (err: any) {
      setError(err?.message || "Kayıt taşınamadı.");
      reload();
    }
  };

  const handleRemove = async (id: string) => {
    const snapshot = places;
    setPlaces((prev) => prev.filter((p) => p.id !== id));
    try {
      await removeSavedPlace(id);
      setLists(await fetchLists());
    } catch (err: any) {
      setPlaces(snapshot);
      setError(err?.message || "Kayıt kaldırılamadı.");
    }
  };

  const handleAddContact = async (id: string, data: Parameters<typeof addContactEvent>[1]) => {
    try {
      const updated = await addContactEvent(id, data);
      setPlaces((prev) => prev.map((place) => (place.id === id ? updated : place)));
    } catch (err: any) {
      if (err?.message === "Gönüllü adınızı Ayarlar'dan girin.") {
        setSettingsOpen(true);
        setError("Temas eklemek için önce Ayarlar’dan gönüllü adınızı girin.");
      }
      throw err;
    }
  };

  const handleExport = async () => {
    if (visible.length === 0 || exporting) return;
    setExporting(true);
    setError(null);
    try {
      const blob = await exportLeads(visible.map(savedToPlace), {
        type: visible[0]?.place_type || "kayitli",
        radius: 0,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${activeListName.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase()}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      fetchAccount().then(setAccount);
    } catch (err: any) {
      setError(err?.message || "Dışa aktarım başarısız oldu.");
    } finally {
      setExporting(false);
    }
  };

  const railItem = (active: boolean) =>
    `group flex w-full items-center gap-2 rounded-input px-2.5 py-2 text-left text-xs font-medium transition-colors duration-fast ease-out ${
      active ? "bg-accent text-accent-ink" : "text-ink-2 hover:bg-paper-2 hover:text-ink"
    }`;

  return (
    <main className="flex h-screen flex-col bg-paper text-ink-2">
      <AppHeader
        account={account}
        onOpenSettings={() => setSettingsOpen(true)}
        savedCount={places.length}
      />

      {error && (
        <div className="shrink-0 rule-b bg-caution-bg">
          <p className="flex items-start gap-2 px-4 py-2 text-xs text-caution">
            <AlertCircle size={13} className="mt-px shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </p>
        </div>
      )}

      <div className="flex flex-1 flex-col-reverse overflow-hidden lg:flex-row">
        {/* Sol ray: listeler */}
        <aside className="flex w-full shrink-0 flex-col overflow-hidden bg-paper lg:w-[17rem] lg:border-r lg:border-rule">
          <div className="rule-b px-4 pt-4 pb-2">
            <h2 className="mono-label">Listeler</h2>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setActiveList(ALL)}
                className={railItem(activeList === ALL)}
              >
                <span className="truncate">Tüm kayıtlar</span>
                <span className="tabular ml-auto text-2xs opacity-70">
                  {places.length}
                </span>
              </button>

              {/* Dosyalanmamis yalnizca icinde bir sey varken gorunuyor:
                  bos bir kova gonullunun ilgilenmesi gereken bir sey degil. */}
              {unfiledCount > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveList(UNFILED)}
                  className={railItem(activeList === UNFILED)}
                >
                  <span className="truncate">Dosyalanmamış</span>
                  <span className="tabular ml-auto text-2xs opacity-70">
                    {unfiledCount}
                  </span>
                </button>
              )}
            </div>

            {lists.length > 0 && (
              <div className="mt-3 space-y-1 border-t border-rule pt-3">
                {lists.map((list) => (
                  <div key={list.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setActiveList(list.id)}
                      className={railItem(activeList === list.id)}
                    >
                      <span className="truncate">{list.name}</span>
                      <span className="tabular ml-auto text-2xs opacity-70">
                        {list.place_count}
                      </span>
                    </button>

                    {pendingDelete === list.id ? (
                      <button
                        type="button"
                        onClick={() => handleDeleteList(list.id)}
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
            )}

            <form onSubmit={handleCreateList} className="mt-3 border-t border-rule pt-3">
              <label className="sr-only" htmlFor="new-list">
                Yeni liste adı
              </label>
              <div className="flex gap-1.5">
                <input
                  id="new-list"
                  type="text"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  placeholder="Yeni liste"
                  className="min-w-0 flex-1 rounded-input border border-rule-2 bg-paper px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-4 transition-colors duration-fast ease-out hover:border-ink-4 focus:border-accent"
                />
                <button
                  type="submit"
                  disabled={!newListName.trim() || creating}
                  aria-label="Liste oluştur"
                  className="btn btn--ghost shrink-0 px-2.5 py-1.5"
                >
                  <Plus size={13} aria-hidden="true" />
                </button>
              </div>
              <p className="mt-1.5 text-2xs leading-relaxed text-ink-4">
                Örnek: &quot;Kadıköy liseleri&quot;, &quot;Eylül görüşmeleri&quot;
              </p>
            </form>
          </div>

          {/* Sayfanin footer'i: gecmis buraya degil, ana kolona gidiyor;
              burada yalnizca durum var. */}
          <div className="shrink-0 rule-t bg-paper-2 px-4 py-2.5">
            <span className="mono-label tabular">{places.length} kayıt</span>
          </div>
        </aside>

        {/* Ana kolon */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 flex-wrap items-center gap-3 rule-b px-4 py-3">
            <div className="min-w-0">
              <h1 className="font-display text-lg font-semibold leading-tight text-ink">
                {activeListName}
              </h1>
              <p className="mono-label tabular mt-0.5">{visible.length} kayıt</p>
            </div>

            <button
              type="button"
              onClick={handleExport}
              disabled={visible.length === 0 || exporting}
              className="btn btn--primary ml-auto px-4 py-2"
            >
              <Download size={14} aria-hidden="true" />
              {exporting ? "Hazırlanıyor…" : "CSV indir"}
            </button>
          </div>

          <CategoryFilter value={typeFilter} onChange={setTypeFilter} counts={typeCounts} />

          <div className="flex-1 overflow-y-auto">
            {dueFollowUps.length > 0 && (
              <section className="rule-b bg-caution-bg px-4 py-3">
                <h2 className="mono-label">Takip zamanı ({dueFollowUps.length})</h2>
                <ul className="mt-2 space-y-1 text-xs text-ink">
                  {dueFollowUps.map((place) => (
                    <li key={place.id}>{place.name || "İsimsiz Yer"} · {place.next_follow_up_at} {isOverdue(place, new Date()) && <span className="ml-1 text-critical">Gecikmiş</span>}</li>
                  ))}
                </ul>
              </section>
            )}
            {loading ? (
              <div className="flex items-center justify-center p-10">
                <span className="mono-label">Yükleniyor</span>
              </div>
            ) : visible.length === 0 ? (
              /*
                Ogretici bos durum (PRODUCT.md ilke 2). Donusken ekipte
                ilk karsilasma en sik karsilasmadir; "kayit yok" tek
                basina gonulluye ne yapacagini soylemiyor.
              */
              <div className="mx-auto max-w-md px-6 py-14 text-center">
                <FolderOpen
                  size={26}
                  aria-hidden="true"
                  strokeWidth={1.5}
                  className="mx-auto mb-4 text-ink-4"
                />
                <h2 className="font-display text-sm font-semibold text-ink">
                  {places.length === 0
                    ? "Henüz kayıtlı yer yok"
                    : "Bu liste boş"}
                </h2>
                <p className="mt-2 text-xs leading-relaxed text-ink-3">
                  {places.length === 0 ? (
                    <>
                      Haritada bir ilçe tarayın, ilgilendiğiniz okulu veya
                      firmayı kaydedin. Kaydettikleriniz burada birikir ve
                      tarayıcıyı kapatsanız da durur.
                    </>
                  ) : (
                    <>
                      Kayıtlarınızı sağdaki klasör simgesinden bu listeye
                      taşıyabilirsiniz.
                    </>
                  )}
                </p>
                {places.length === 0 && (
                  <Link href="/" className="btn btn--primary mt-5 inline-flex px-4 py-2">
                    <Search size={13} aria-hidden="true" />
                    Haritaya git
                  </Link>
                )}
              </div>
            ) : (
              <ul>
                {visible.map((place) => (
                  <SavedPlaceRow
                    key={place.id}
                    place={place}
                    lists={lists}
                    onSaveNote={handleNote}
                    onMove={handleMove}
                    onRemove={handleRemove}
                    onAddContact={handleAddContact}
                    onHistoryError={setError}
                  />
                ))}
              </ul>
            )}
          </div>

          <ExportHistory />
        </div>
      </div>

      <SettingsModal
        isOpen={settingsOpen}
        account={account}
        onClose={() => setSettingsOpen(false)}
        onSaved={() => {
          setSettingsOpen(false);
          fetchAccount().then(setAccount);
          reload();
        }}
      />
    </main>
  );
}
