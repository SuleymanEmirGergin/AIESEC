"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import AppHeader from "../components/AppHeader";
import FilterPanel from "../components/FilterPanel";
import ResultsTable, { nextSort } from "../components/ResultsTable";
import SearchWizard, { type WizardSelection } from "../components/SearchWizard";
import SaveDoneModal from "../components/SaveDoneModal";
import ReportModal from "../components/ReportModal";
import { exportLeads, downloadBlob } from "../lib/api";
import type { ExportFormat } from "../lib/api";
import { PLACE_TYPE_LABELS } from "../lib/labels";
import {
  districtPlaceToPlace,
  fetchDistrictPlaces,
  fetchDistricts,
  provinceName,
  type PlaceQuery,
} from "../lib/districts";
import { createList, fetchSavedPlaces, savePlaces } from "../lib/savedApi";
import SaveTargetModal, { rememberList, type SaveTarget } from "../components/SaveTargetModal";
import type { Place } from "../lib/types";
import { BookmarkPlus, List, Map as MapIcon, Pencil, X } from "lucide-react";

/**
 * Bir sayfada cekilen kayit sayisi. Yogun ilcelerde (Eyupsultan 7139)
 * tum satirlari birden DOM'a basmak sayfayi kilitliyordu.
 */
const PAGE_SIZE = 250;

/** Toplu kayitta istek basina yer sayisi; ilerleme gorunsun diye parcali. */
const BULK_CHUNK = 1000;

/** "Hepsini kaydet" icin sayfa boyu; ilce ucunun ust siniri. */
const FETCH_ALL_PAGE = 1000;

/** Backend ExportRequest.items siniri. */
const MAX_EXPORT_ITEMS = 10_000;

/** Kayitlilar'a gidip donunce arama kaybolmasin (sekme boyunca). */
const LAST_SEARCH_KEY = "last_search";

const DEFAULT_QUERY: PlaceQuery = { sort: "contact_first", limit: PAGE_SIZE };

const MapView = dynamic(() => import("../components/MapView"), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-paper-3" />,
});

const noop = () => {};

interface SaveDone {
  places: Place[];
  destination: string;
  /** Indirilen dosyanin basligi ve adi. */
  title: string;
}

export default function Home() {
  const [selection, setSelection] = useState<WizardSelection | null>(null);
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState<PlaceQuery>(DEFAULT_QUERY);
  const [places, setPlaces] = useState<Place[]>([]);
  /** Filtreye uyan TOPLAM kayit (sayfadaki degil). */
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [view, setView] = useState<"list" | "map">("list");

  /** Kaydedilmis yerlerin place_id'leri: "Kayitli" rozeti icin. */
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  /** Tabloda isaretlenenler; kaydetme bunlar uzerinden. */
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [pendingSave, setPendingSave] = useState<{ scope: "selected" | "all"; count: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState<{ done: number; total: number } | null>(null);
  const [saveDone, setSaveDone] = useState<SaveDone | null>(null);
  const [exporting, setExporting] = useState(false);

  const [reportTarget, setReportTarget] = useState<Place | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reloadSaved = useCallback(async () => {
    try {
      const saved = await fetchSavedPlaces();
      setSavedIds(new Set(saved.map((s) => s.place_id)));
    } catch {
      // Rozetler eksik kalir; arama yine calismali.
    }
  }, []);

  useEffect(() => {
    reloadSaved();
  }, [reloadSaved]);

  // Son aramayi geri yukle.
  useEffect(() => {
    let stored: { districtId: string; types: WizardSelection["types"] } | null = null;
    try {
      stored = JSON.parse(sessionStorage.getItem(LAST_SEARCH_KEY) ?? "null");
    } catch {
      return;
    }
    if (!stored) return;
    fetchDistricts()
      .then((all) => {
        const district = all.find((d) => d.id === stored!.districtId);
        if (district && stored!.types.length) startSearch({ district, types: stored!.types });
      })
      .catch(noop);
    // Yalnizca ilk acilista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startSearch = useCallback((next: WizardSelection) => {
    setSelection(next);
    setEditing(false);
    setQuery({ ...DEFAULT_QUERY, types: next.types });
    setPlaces([]);
    setView("list");
    try {
      sessionStorage.setItem(LAST_SEARCH_KEY, JSON.stringify({ districtId: next.district.id, types: next.types }));
    } catch {
      // Depolama kapaliysa yalnizca geri yukleme olmaz.
    }
  }, []);

  const reportError = useCallback((err: any, fallback: string) => {
    if (err?.name === "TimeoutError") {
      setNotice("İşlem zaman aşımına uğradı. Lütfen tekrar deneyin.");
    } else setNotice(err?.message || fallback);
  }, []);

  /** Ilk sayfa. Sorgu yerel veritabanina gidiyor; filtre degisince yeniden. */
  useEffect(() => {
    if (!selection) return;
    let alive = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      setSelected(new Set());
      try {
        const response = await fetchDistrictPlaces(selection.district.id, { ...query, offset: 0 });
        if (!alive) return;
        setPlaces(response.results.map(districtPlaceToPlace));
        setTotal(response.total);
        setNotice(null);
      } catch (err: any) {
        if (!alive) return;
        setPlaces([]);
        setTotal(0);
        setNotice(err?.message || "Tarama başarısız oldu.");
      } finally {
        if (alive) setLoading(false);
      }
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [selection, query]);

  const loadMore = useCallback(async () => {
    if (!selection || loadingMore || places.length >= total) return;
    setLoadingMore(true);
    try {
      const response = await fetchDistrictPlaces(selection.district.id, { ...query, offset: places.length });
      const mapped = response.results.map(districtPlaceToPlace);
      setPlaces((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...mapped.filter((p) => !seen.has(p.id))];
      });
      setTotal(response.total);
    } catch (err: any) {
      setNotice(err?.message || "Sonraki sayfa yüklenemedi.");
    } finally {
      setLoadingMore(false);
    }
  }, [selection, query, places.length, total, loadingMore]);

  const toggleOne = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((prev) => (places.every((p) => prev.has(p.id)) ? new Set() : new Set(places.map((p) => p.id))));
  }, [places]);

  /**
   * Filtreye uyan TUM sonuclar - yuklenmemis sayfalar dahil. Listeye
   * basilmiyor: binlerce satiri DOM'a koymak tarayiciyi kilitliyordu.
   */
  const collectAll = useCallback(async (): Promise<Place[]> => {
    if (!selection) return places;
    const all = [...places];
    const seen = new Set(all.map((p) => p.id));
    for (let offset = places.length; offset < total; offset += FETCH_ALL_PAGE) {
      const response = await fetchDistrictPlaces(selection.district.id, { ...query, limit: FETCH_ALL_PAGE, offset });
      if (response.results.length === 0) break;
      for (const place of response.results.map(districtPlaceToPlace)) {
        if (!seen.has(place.id)) {
          seen.add(place.id);
          all.push(place);
        }
      }
    }
    return all;
  }, [selection, places, total, query]);

  const defaultTitle = useMemo(() => {
    if (!selection) return "Kayıtlı yerler";
    const { district, types } = selection;
    const what = types.length === 1 ? PLACE_TYPE_LABELS[types[0]] : "Kayıtlı yerler";
    return `${district.name} · ${what}`;
  }, [selection]);

  /** Hedef secildi: gerekiyorsa listeyi olustur, parcali kaydet, sonra indirme sorusu. */
  const confirmSaveTarget = useCallback(
    async (target: SaveTarget) => {
      const scope = pendingSave?.scope;
      setPendingSave(null);
      if (!scope || saving) return;
      setSaving(true);
      setNotice(null);
      try {
        let listId: string | null = null;
        let destination = "Dosyalanmamış";
        if (target.kind === "list") {
          listId = target.listId;
          destination = target.name;
        }
        if (target.kind === "new") {
          listId = (await createList(target.name)).id;
          rememberList(listId);
          destination = target.name;
        }

        const targets = scope === "all" ? await collectAll() : places.filter((p) => selected.has(p.id));
        // Liste secildiyse kayitli olanlar da gidiyor (sunucu o listeye
        // tasiyor); dosyalanmamis secildiyse mevcutlarin listesi korunur.
        const batch = listId ? targets : targets.filter((p) => !savedIds.has(p.id));
        setSaveProgress({ done: 0, total: batch.length });
        for (let i = 0; i < batch.length; i += BULK_CHUNK) {
          await savePlaces(batch.slice(i, i + BULK_CHUNK), listId);
          setSaveProgress({ done: Math.min(i + BULK_CHUNK, batch.length), total: batch.length });
        }

        setSavedIds((prev) => new Set([...prev, ...targets.map((p) => p.id)]));
        setSelected(new Set());
        setSaveDone({ places: targets, destination, title: listId ? destination : defaultTitle });
      } catch (err: any) {
        reportError(err, "Bazı kayıtlar eklenemedi.");
      } finally {
        setSaving(false);
        setSaveProgress(null);
      }
    },
    [pendingSave, saving, collectAll, places, selected, savedIds, defaultTitle, reportError]
  );

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      if (!saveDone || exporting) return;
      setExporting(true);
      try {
        const items = saveDone.places.slice(0, MAX_EXPORT_ITEMS);
        const blob = await exportLeads(items, {
          type: items[0]?.type ?? "kayitli",
          radius: 0,
          format,
          title: saveDone.title,
        });
        downloadBlob(blob, saveDone.title, format);
        setSaveDone(null);
        if (saveDone.places.length > MAX_EXPORT_ITEMS) {
          setNotice(`Dosyaya ilk ${MAX_EXPORT_ITEMS} kayıt yazıldı; kalanları Kayıtlılar’dan indirebilirsiniz.`);
        }
      } catch (err: any) {
        setSaveDone(null);
        reportError(err, "Dosya indirilemedi.");
      } finally {
        setExporting(false);
      }
    },
    [saveDone, exporting, reportError]
  );

  const mapCenter = useMemo<[number, number]>(
    () => (selection ? [selection.district.center[0], selection.district.center[1]] : [41.0082, 28.9784]),
    [selection]
  );

  const showWizard = !selection || editing;

  return (
    <main className="flex h-screen flex-col bg-paper text-ink-2">
      <AppHeader savedCount={savedIds.size} />

      {notice && (
        <div className="shrink-0 rule-b bg-caution-bg">
          <div className="flex items-start gap-3 px-4 py-2">
            <p className="text-xs leading-relaxed text-caution">{notice}</p>
            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label="Bildirimi kapat"
              className="ml-auto shrink-0 text-caution transition-colors duration-fast ease-out hover:text-ink"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {showWizard ? (
        <div className="min-h-0 flex-1">
          <SearchWizard
            initial={selection}
            onConfirm={startSearch}
            onCancel={selection ? () => setEditing(false) : undefined}
          />
        </div>
      ) : (
        selection && (
          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <aside className="max-h-[40vh] shrink-0 overflow-y-auto bg-paper lg:max-h-none lg:w-72 lg:border-r lg:border-rule">
              <div className="rule-b px-4 py-4">
                <p className="mono-label">{provinceName(selection.district)}</p>
                <h1 className="font-display text-lg font-semibold text-ink">{selection.district.name}</h1>
                <div className="mt-2 flex flex-wrap gap-1">
                  {selection.types.map((t) => (
                    <span key={t} className="rounded-input bg-accent-wash px-2 py-0.5 text-2xs text-accent">
                      {PLACE_TYPE_LABELS[t]}
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="btn btn--ghost mt-3 w-full justify-center px-3 py-1.5 text-xs"
                >
                  <Pencil size={12} aria-hidden="true" />
                  Aramayı değiştir
                </button>
              </div>
              <FilterPanel value={query} onChange={(next) => setQuery({ ...next, types: selection.types })} />
            </aside>

            <section className="flex min-h-0 flex-1 flex-col">
              <div className="flex shrink-0 flex-wrap items-center gap-2 rule-b px-4 py-2.5">
                <p className="mono-label tabular">
                  {loading ? "Taranıyor…" : total > places.length ? `${places.length} / ${total} sonuç` : `${total} sonuç`}
                </p>

                <div className="ml-2 inline-flex rounded-input border border-rule p-0.5" role="group" aria-label="Görünüm">
                  {(
                    [
                      ["list", "Liste", List],
                      ["map", "Harita", MapIcon],
                    ] as const
                  ).map(([id, label, Icon]) => (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={view === id}
                      onClick={() => setView(id)}
                      className={`inline-flex items-center gap-1 rounded-[4px] px-2 py-1 text-2xs font-medium transition-colors duration-fast ease-out ${
                        view === id ? "bg-accent text-accent-ink" : "text-ink-3 hover:text-ink"
                      }`}
                    >
                      <Icon size={12} aria-hidden="true" />
                      {label}
                    </button>
                  ))}
                </div>

                <div className="ml-auto flex flex-wrap items-center gap-2">
                  {saveProgress && (
                    <span className="mono-label tabular">
                      Kaydediliyor {saveProgress.done} / {saveProgress.total}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setPendingSave({ scope: "selected", count: selected.size })}
                    disabled={selected.size === 0 || saving}
                    className="btn btn--ghost px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <BookmarkPlus size={14} aria-hidden="true" />
                    Seçilenleri kaydet ({selected.size})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingSave({ scope: "all", count: total })}
                    disabled={total === 0 || saving || loading}
                    className="btn btn--primary px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <BookmarkPlus size={14} aria-hidden="true" />
                    Hepsini kaydet ({total})
                  </button>
                </div>
              </div>

              <div className="relative min-h-0 flex-1">
                {view === "list" ? (
                  <ResultsTable
                    places={places}
                    total={total}
                    loading={loading}
                    loadingMore={loadingMore}
                    savedIds={savedIds}
                    selected={selected}
                    onToggle={toggleOne}
                    onToggleAll={toggleAll}
                    onLoadMore={loadMore}
                    onReport={setReportTarget}
                    sort={query.sort}
                    onSort={(column) => setQuery((q) => ({ ...q, sort: nextSort(column, q.sort) }))}
                  />
                ) : (
                  <MapView places={places} center={mapCenter} zoom={13} onBoundsChange={noop} />
                )}
              </div>
            </section>
          </div>
        )
      )}

      <SaveTargetModal
        isOpen={pendingSave !== null}
        count={pendingSave?.count ?? 0}
        onClose={() => setPendingSave(null)}
        onConfirm={confirmSaveTarget}
      />

      <SaveDoneModal
        isOpen={saveDone !== null}
        count={saveDone?.places.length ?? 0}
        destination={saveDone?.destination ?? ""}
        exporting={exporting}
        onExport={handleExport}
        onClose={() => setSaveDone(null)}
      />

      {reportTarget && (
        <ReportModal
          key={reportTarget.id}
          place={reportTarget}
          isOpen
          onClose={() => setReportTarget(null)}
          onSuccess={() => {
            setReportTarget(null);
            setNotice("Bildiriminiz alındı, teşekkürler.");
          }}
        />
      )}

    </main>
  );
}
