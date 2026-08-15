"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import AppHeader from "../components/AppHeader";
import DistrictPicker from "../components/DistrictPicker";
import FilterPanel from "../components/FilterPanel";
import Filters from "../components/Filters";
import PlaceList from "../components/PlaceList";
import ExportToolbar from "../components/ExportToolbar";
import ReportModal from "../components/ReportModal";
import SettingsModal from "../components/SettingsModal";
import UpgradeModal from "../components/UpgradeModal";
import { searchPlaces, exportLeads, fetchAccount } from "../lib/api";
import type { AccountInfo } from "../lib/api";
import CategoryFilter from "../components/CategoryFilter";
import {
  districtPlaceToPlace,
  fetchDistrictPlaces,
  fetchDistrictSummary,
  type DistrictMeta,
  type PlaceQuery,
} from "../lib/districts";
import { fetchSavedPlaces, savePlace, removeSavedPlace } from "../lib/savedApi";
import type { Place, PlaceType } from "../lib/types";
import { X, Database } from "lucide-react";

/**
 * Bir sayfada cekilen kayit sayisi.
 *
 * Ilce sorgusu yerel SQLite'a gittigi icin ucuz; sinir aginin degil
 * tarayicinin sinirlarindan geliyor. Yogun ilcelerde (Eyupsultan 7139)
 * tum satirlari birden DOM'a basmak sayfayi kilitliyordu.
 */
const PAGE_SIZE = 250;

// Client-side only map import
const MapView = dynamic(() => import("../components/MapView"), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-paper-3" />,
});

export default function Home() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [category, setCategory] = useState<PlaceType | null>(null);
  const [bbox, setBbox] = useState<[number, number, number, number] | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string>();
  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * Ilce bazli arama. Secili ilce varsa sorgu yerel veritabanina gidiyor
   * (Overpass beklemesi yok); yoksa haritanin gordugu alan taraniyor.
   * Iki yol da ayni `places` dizisini dolduruyor.
   */
  const [district, setDistrict] = useState<DistrictMeta | null>(null);
  const [query, setQuery] = useState<PlaceQuery>({ sort: "contact_first", limit: PAGE_SIZE });
  const [districtEmpty, setDistrictEmpty] = useState(false);

  /**
   * Filtreye uyan TOPLAM kayit sayisi (sayfadaki degil).
   *
   * Ekranda "250 / 7139 gosteriliyor" diyebilmek icin gerekli: eskiden
   * yalnizca yuklenen sayi gosteriliyordu ve kullanici 250'yi ilcenin
   * tamami saniyordu.
   */
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  /**
   * Ilcenin tur bazli envanteri (`/summary`). Kategori ciplerindeki
   * sayilar buradan; secimden bagimsiz, cunku bunlar "ilcede ne var"
   * sorusunun cevabi.
   */
  const [typeCounts, setTypeCounts] = useState<Record<PlaceType, number>>();

  /**
   * Kaydedilmis yerlerin place_id kumesi.
   *
   * Sepet artik React state'inde yasamiyor: kaydetme dogrudan sunucuya
   * gidiyor ve sayfa yenilense de duruyor. Burada tutulan sey yalnizca
   * "hangileri kayitli" gostergesi.
   */
  const [savedIds, setSavedIds] = useState<Map<string, string>>(new Map());
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);

  const [reportTarget, setReportTarget] = useState<Place | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [slowSearch, setSlowSearch] = useState(false);
  const [account, setAccount] = useState<AccountInfo | null>(null);

  const reloadAccount = useCallback(() => {
    fetchAccount().then(setAccount);
  }, []);

  const reloadSaved = useCallback(async () => {
    try {
      const saved = await fetchSavedPlaces();
      setSavedIds(new Map(saved.map((s) => [s.place_id, s.id])));
    } catch {
      // Kayitlar okunamadiysa arama yine calismali; yalnizca kaydetme
      // gostergesi eksik kalir.
    }
  }, []);

  useEffect(() => {
    reloadAccount();
    reloadSaved();
  }, [reloadAccount, reloadSaved]);

  const exportBlockedReason = (() => {
    if (!account) return "Hesap durumu okunamadı; dışa aktarım şu an kullanılamıyor.";
    if (!account.is_active) return "Kullanılan erişim anahtarı devre dışı.";
    if (account.plan === "free") return "CSV dışa aktarım ücretsiz planda kapalı.";
    if (account.daily_limit - account.used_today < 2) {
      return "Bugünkü hak dışa aktarım için yetersiz.";
    }
    return null;
  })();

  /**
   * Kaydet / kaydı kaldır.
   *
   * Iyimser guncelleme: gonullu tikladiginda isaret hemen degisiyor,
   * sunucu cevabini beklemiyor. Hata olursa geri aliniyor.
   */
  const toggleSaved = useCallback(
    async (place: Place) => {
      if (savingId === place.id) return;
      setSavingId(place.id);
      const existingId = savedIds.get(place.id);
      const snapshot = new Map(savedIds);

      try {
        if (existingId) {
          setSavedIds((prev) => {
            const next = new Map(prev);
            next.delete(place.id);
            return next;
          });
          await removeSavedPlace(existingId);
        } else {
          const created = await savePlace(place);
          setSavedIds((prev) => new Map(prev).set(place.id, created.id));
        }
      } catch (err: any) {
        setSavedIds(snapshot);
        setNotice(err?.message || "Kaydedilemedi.");
      } finally {
        setSavingId(null);
      }
    },
    [savedIds, savingId]
  );

  const saveAllVisible = useCallback(async () => {
    const unsaved = places.filter((p) => !savedIds.has(p.id));
    if (unsaved.length === 0 || savingAll) return;
    setSavingAll(true);
    setNotice(null);
    try {
      // Sirali: toplu POST ucu yok ve es zamanli yuzlerce istek
      // backend'i bosuna zorlar. Her kayit tamamlandiginda isaret
      // aniden degil tek tek doluyor - islem suruyor izlenimi veriyor.
      for (const place of unsaved) {
        const created = await savePlace(place);
        setSavedIds((prev) => new Map(prev).set(place.id, created.id));
      }
    } catch (err: any) {
      setNotice(err?.message || "Bazı kayıtlar eklenemedi.");
    } finally {
      setSavingAll(false);
    }
  }, [places, savedIds, savingAll]);

  const handleApiError = useCallback((err: any) => {
    const message = String(err?.message ?? "");
    if (message === "QUOTA_EXCEEDED") return setUpgradeOpen(true);
    if (err?.name === "TimeoutError") {
      return setNotice("İşlem zaman aşımına uğradı. Lütfen tekrar deneyin.");
    }
    if (/plan|upgrade|disabled for/i.test(message)) return setUpgradeOpen(true);
    if (/API-KEY|api key|401|yetki/i.test(message)) {
      setNotice("Bu işlem için erişim anahtarı gerekli.");
      return setSettingsOpen(true);
    }
    setNotice(message || "İşlem başarısız oldu.");
  }, []);

  const handleExport = useCallback(async () => {
    const chosen = places.filter((p) => savedIds.has(p.id));
    if (chosen.length === 0 || exporting) return;

    setExporting(true);
    setNotice(null);
    try {
      const blob = await exportLeads(chosen, {
        type: category ?? chosen[0]?.type ?? "kayitli",
        radius: 0,
        center: bbox
          ? { lat: (bbox[1] + bbox[3]) / 2, lon: (bbox[0] + bbox[2]) / 2 }
          : undefined,
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `leads_${category ?? "kayitli"}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      reloadAccount();
    } catch (err) {
      handleApiError(err);
    } finally {
      setExporting(false);
    }
  }, [places, savedIds, category, bbox, exporting, handleApiError, reloadAccount]);

  /**
   * Ilce envanterini cek (tur basina kayit sayisi).
   *
   * Sorgudan AYRI tutuluyor: bu sayilar filtreye gore degismemeli,
   * yoksa bir turu kapatinca digerlerinin sayisi da degisir ve
   * "ilcede kac tane var" sorusu cevapsiz kalirdi. Yalnizca ilce
   * degisince yenileniyor.
   */
  useEffect(() => {
    if (!district) {
      setTypeCounts(undefined);
      return;
    }
    let alive = true;
    fetchDistrictSummary(district.id, query.includeBuffer !== false)
      .then((s) => alive && setTypeCounts(s.counts))
      // Sayilar bir kolaylik; gelmezse cipler sayisiz calisir.
      .catch(() => alive && setTypeCounts(undefined));
    return () => {
      alive = false;
    };
  }, [district, query.includeBuffer]);

  /** Ilce secildiginde yerel veritabanindan ILK sayfayi sorgula. */
  const runDistrictSearch = useCallback(async () => {
    if (!district) return;
    setLoading(true);
    setDistrictEmpty(false);
    try {
      const response = await fetchDistrictPlaces(district.id, { ...query, offset: 0 });
      const mapped = response.results.map(districtPlaceToPlace);
      setPlaces(mapped);
      setTotal(response.total);
      setDistrictEmpty(mapped.length === 0);
      setNotice(null);
    } catch (err: any) {
      setPlaces([]);
      setTotal(0);
      setNotice(err?.message || "İlçe sorgusu başarısız oldu.");
    } finally {
      setLoading(false);
    }
  }, [district, query]);

  /**
   * Sonraki sayfayi ekle.
   *
   * Hepsini tek seferde cekip DOM'a basmak yogun ilcelerde (Eyupsultan
   * 7139 kayit) tarayiciyi kilitliyordu. Sayfa sayfa ekliyoruz; toplam
   * sayi hep gorunur oldugu icin kullanici neyin eksik oldugunu biliyor.
   *
   * `offset` olarak ekrandaki kayit sayisi kullaniliyor: sunucu ayni
   * siralamayi uyguladigi icin bu, "kaldigim yerden devam" demek.
   */
  const loadMore = useCallback(async () => {
    if (!district || loadingMore || places.length >= total) return;
    setLoadingMore(true);
    try {
      const response = await fetchDistrictPlaces(district.id, {
        ...query,
        offset: places.length,
      });
      const mapped = response.results.map(districtPlaceToPlace);
      // Eszamanli iki cagri ayni sayfayi getirirse tekrar olmasin.
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
  }, [district, query, places.length, total, loadingMore]);

  /** Ilce secili degilken haritanin gordugu alani tara. */
  const runMapSearch = useCallback(async () => {
    if (!category || !bbox) {
      setPlaces([]);
      return;
    }

    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const isCurrent = () => abortControllerRef.current === controller;

    setLoading(true);
    try {
      const { places: results, meta } = await searchPlaces(
        { bbox, category, limit: 250 },
        { signal: controller.signal }
      );
      if (!isCurrent()) return;
      setPlaces(results);

      if (meta?.radiusClamped) {
        setNotice(
          `Harita çok geniş. Merkez çevresinde ${Math.round(
            (meta.radiusUsed ?? 0) / 1000
          )} km taranıyor; daha fazlası için yakınlaşın.`
        );
      } else {
        setNotice(null);
      }
    } catch (err: any) {
      if (err?.name === "AbortError" || !isCurrent()) return;
      setPlaces([]);
      if (err?.message === "QUOTA_EXCEEDED") setUpgradeOpen(true);
      else if (err?.name === "TimeoutError") {
        setNotice(
          "Arama zaman aşımına uğradı. Harita servisi şu an yavaş; " +
            "daha dar bir alana yakınlaşıp tekrar deneyin."
        );
      } else setNotice(err?.message || "Arama başarısız oldu.");
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [category, bbox]);

  useEffect(() => {
    if (!loading) {
      setSlowSearch(false);
      return;
    }
    const timer = setTimeout(() => setSlowSearch(true), 12_000);
    return () => clearTimeout(timer);
  }, [loading]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (district) runDistrictSearch();
      else runMapSearch();
    }, 400);
    return () => clearTimeout(timer);
  }, [district, runDistrictSearch, runMapSearch]);

  const mapCenter: [number, number] = district
    ? [district.center[0], district.center[1]]
    : [41.0082, 28.9784];

  const savedInView = places.filter((p) => savedIds.has(p.id)).length;

  return (
    <main className="flex h-screen flex-col bg-paper text-ink-2">
      <AppHeader
        account={account}
        onOpenSettings={() => setSettingsOpen(true)}
        savedCount={savedIds.size}
      />

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

      {slowSearch && loading && (
        <div className="shrink-0 rule-b bg-paper-2">
          <div className="flex items-center gap-2.5 px-4 py-2">
            <span
              aria-hidden="true"
              className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-rule border-t-accent"
            />
            <p className="text-xs text-ink-3">
              Arama sürüyor. Harita servisi şu an yavaş; geniş alanlarda bu bir
              dakikayı aşabilir.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col-reverse overflow-hidden lg:flex-row">
        <aside className="flex w-full shrink-0 flex-col overflow-hidden bg-paper lg:w-[19rem] lg:border-r lg:border-rule">
          <div className="flex-1 overflow-y-auto">
            <DistrictPicker
              selectedId={district?.id ?? null}
              onSelect={(next) => {
                setDistrict(next);
                setPlaces([]);
                setDistrictEmpty(false);
              }}
            />

            {/*
              Ilce secilince ayrintili filtre paneli, secilmeyince eski
              kategori cipleri. Ikisi ayni anda gorunmuyor: iki farkli
              sorgu yolu var ve gonulluye ikisini ayni anda sunmak
              hangisinin ise yaradigini belirsizlestirirdi.
            */}
            {district ? (
              <>
                <CategoryFilter
                  value={query.types ?? []}
                  onChange={(types) =>
                    // Bos dizi filtreyi tamamen kaldirmali; `types: []`
                    // gondermek sunucuda "hicbir tur" anlamina gelebilir.
                    setQuery({ ...query, types: types.length ? types : undefined })
                  }
                  counts={typeCounts}
                />
                <FilterPanel value={query} onChange={setQuery} />
              </>
            ) : (
              <Filters selectedCategory={category} onCategoryChange={setCategory} />
            )}

            {district && districtEmpty && !loading ? (
              /*
                Durust bos durum: 80 ilcenin hicbiri henuz ingest
                edilmedi. "Sonuc yok" demek gonulluye yanlis bir sey
                ogretirdi - arama bozuk degil, veri henuz cekilmemis.
              */
              <div className="px-4 py-8 text-center">
                <Database
                  size={22}
                  aria-hidden="true"
                  strokeWidth={1.5}
                  className="mx-auto mb-3 text-ink-4"
                />
                <p className="text-xs font-medium text-ink">
                  {district.name} için veri henüz çekilmemiş
                </p>
                <p className="mt-1.5 text-2xs leading-relaxed text-ink-3">
                  Bu ilçenin kayıtları veritabanına aktarılmadan sonuç
                  gelmez. İlçe seçimini kaldırıp haritadan tarayabilirsiniz.
                </p>
                <button
                  type="button"
                  onClick={() => setDistrict(null)}
                  className="btn btn--ghost mt-4 px-3 py-2"
                >
                  Haritadan tara
                </button>
              </div>
            ) : (
              <>
                <PlaceList
                  places={places}
                  loading={loading}
                  selectedPlaceId={selectedPlaceId}
                  onPlaceClick={setSelectedPlaceId}
                  checkedIds={new Set(savedIds.keys())}
                  onToggleCheck={toggleSaved}
                  onReport={setReportTarget}
                />

                {district && places.length < total && (
                  <div className="px-3 py-3">
                    <button
                      type="button"
                      onClick={loadMore}
                      disabled={loadingMore}
                      className="btn btn--ghost w-full py-2 text-xs disabled:opacity-50"
                    >
                      {loadingMore
                        ? "Yükleniyor..."
                        : `Daha fazla yükle (${total - places.length} kayıt daha)`}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-between rule-t bg-paper-2 px-4 py-2.5">
            {/*
              Ilce akisinda toplami da gosteriyoruz: eskiden yalnizca
              yuklenen sayi vardi ve kullanici 250'yi ilcenin tamami
              saniyordu.
            */}
            <span className="mono-label tabular">
              {district && total > places.length
                ? `${places.length} / ${total} sonuç`
                : `${places.length} sonuç`}
            </span>
            {savedInView > 0 && (
              <Link
                href="/kayitli"
                className="mono-label tabular text-accent transition-colors duration-fast ease-out hover:text-accent-hover"
              >
                {savedInView} kayıtlı
              </Link>
            )}
          </div>
        </aside>

        <div className="flex min-h-[45vh] flex-1 flex-col overflow-hidden lg:min-h-0">
          <div className="relative flex-1 overflow-hidden">
            <MapView
              places={places}
              center={mapCenter}
              zoom={district ? 13 : 12}
              onBoundsChange={setBbox}
              selectedPlaceId={selectedPlaceId}
            />
          </div>

          <ExportToolbar
            savedCount={savedInView}
            totalResults={places.length}
            onSaveAll={saveAllVisible}
            onExport={handleExport}
            exportBlockedReason={exportBlockedReason}
            quotaRemaining={
              account ? account.daily_limit - account.used_today : null
            }
            isExporting={exporting}
            isSavingAll={savingAll}
          />
        </div>
      </div>

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

      <SettingsModal
        isOpen={settingsOpen}
        account={account}
        onClose={() => setSettingsOpen(false)}
        onSaved={() => {
          setSettingsOpen(false);
          setNotice(null);
          reloadAccount();
          reloadSaved();
        }}
      />

      <UpgradeModal isOpen={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
    </main>
  );
}
