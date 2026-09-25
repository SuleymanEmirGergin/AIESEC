"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
import { searchPlaces, exportLeads, fetchAccount, downloadBlob } from "../lib/api";
import type { AccountInfo, ExportFormat } from "../lib/api";
import { PLACE_TYPE_LABELS } from "../lib/labels";
import CategoryFilter from "../components/CategoryFilter";
import {
  districtPlaceToPlace,
  fetchDistrictPlaces,
  fetchDistrictSummary,
  type DistrictMeta,
  type PlaceQuery,
} from "../lib/districts";
import {
  createList,
  fetchSavedPlaces,
  savePlace,
  savePlaces,
  removeSavedPlace,
} from "../lib/savedApi";
import SaveTargetModal, { rememberList, type SaveTarget } from "../components/SaveTargetModal";
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

/**
 * Toplu kayitta istek basina yer sayisi. Sunucu 10.000'e kadar kabul
 * ediyor; parcalamak ilerlemenin gorunmesi ve tek istegin zaman asimina
 * yaklasmamasi icin.
 */
const BULK_CHUNK = 1000;

/** "Tum sonuclari kaydet" icin sayfa boyu; ilce ucunun ust siniri. */
const FETCH_ALL_PAGE = 1000;

/** Sunucu cevabi gelene kadar isaretli gorunen yerin gecici id'si. */
const PENDING_ID = "pending";

const NO_VOLUNTEER = "Gönüllü adınızı Ayarlar'dan girin.";

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
  // toggleSaved'in guncel degeri callback'i yeniden olusturmadan okumasi icin.
  const savedIdsRef = useRef(savedIds);
  savedIdsRef.current = savedIds;
  const checkedIds = useMemo(() => new Set(savedIds.keys()), [savedIds]);
  // Istegi suren yerler: ayni yere cevap gelmeden ikinci tiklama yok sayilir.
  const pendingRef = useRef<Set<string>>(new Set());
  const [savingAll, setSavingAll] = useState(false);
  /** Toplu kayit ilerlemesi; null iken toplu kayit yok. */
  const [saveProgress, setSaveProgress] = useState<{ done: number; total: number } | null>(
    null
  );

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

  const reportSaveError = useCallback((err: any, fallback: string) => {
    if (err?.message === NO_VOLUNTEER) {
      setSettingsOpen(true);
      setNotice("Yer kaydetmek için önce Ayarlar’dan gönüllü adınızı girin.");
    } else setNotice(err?.message || fallback);
  }, []);

  /**
   * Kaydet / kaydı kaldır.
   *
   * Iyimser guncelleme: isaret tiklama aninda degisiyor, sunucu cevabini
   * beklemiyor; hata olursa yalnizca BU yer geri aliniyor. Eskiden
   * kaydetme cevabi bekliyordu ve gelistirme modunda ilk tiklama route
   * derlemesi yuzunden saniyelerce isaretsiz kaliyordu.
   */
  const toggleSaved = useCallback(
    async (place: Place) => {
      if (pendingRef.current.has(place.id)) return;
      pendingRef.current.add(place.id);
      const existingId = savedIdsRef.current.get(place.id);

      const setEntry = (id: string | null) =>
        setSavedIds((prev) => {
          const next = new Map(prev);
          if (id === null) next.delete(place.id);
          else next.set(place.id, id);
          return next;
        });

      try {
        if (existingId) {
          setEntry(null);
          await removeSavedPlace(existingId);
        } else {
          setEntry(PENDING_ID);
          const created = await savePlace(place);
          setEntry(created.id);
        }
      } catch (err: any) {
        setEntry(existingId ?? null);
        reportSaveError(err, "Kaydedilemedi.");
      } finally {
        pendingRef.current.delete(place.id);
      }
    },
    // savedIds'e bagli degil (ref'ten okunuyor): kimligi sabit kalmali ki
    // memo'lu liste satirlari her kayitta yeniden cizilmesin.
    [reportSaveError]
  );

  /**
   * Yerleri toplu uctan, BULK_CHUNK'lik parcalarla kaydeder.
   *
   * Eskiden her yer ayri istekti (250 yer ~25 sn, her birinde harita ve
   * liste yeniden ciziliyordu). Parca basina tek istek ve tek state
   * guncellemesi.
   */
  const saveMany = useCallback(
    async (targets: Place[], listId: string | null) => {
      // Liste secildiyse zaten kayitli olanlar da gidiyor: sunucu onlari
      // o listeye tasiyor, yani "bu sonuclari su listeye" niyeti tamamlaniyor.
      // Dosyalanmamis secildiyse yalnizca yeniler; mevcutlarin listesi korunur.
      const batch = listId ? targets : targets.filter((p) => !savedIds.has(p.id));
      if (batch.length === 0) return;
      setSaveProgress({ done: 0, total: batch.length });
      for (let i = 0; i < batch.length; i += BULK_CHUNK) {
        const { ids } = await savePlaces(batch.slice(i, i + BULK_CHUNK), listId);
        setSavedIds((prev) => {
          const next = new Map(prev);
          for (const [placeId, savedId] of Object.entries(ids)) next.set(placeId, savedId);
          return next;
        });
        setSaveProgress({ done: Math.min(i + BULK_CHUNK, batch.length), total: batch.length });
      }
    },
    [savedIds]
  );

  const runBulkSave = useCallback(
    async (collect: () => Promise<Place[]>, listId: string | null) => {
      if (savingAll) return;
      setSavingAll(true);
      setNotice(null);
      try {
        await saveMany(await collect(), listId);
      } catch (err: any) {
        reportSaveError(err, "Bazı kayıtlar eklenemedi.");
      } finally {
        setSavingAll(false);
        setSaveProgress(null);
      }
    },
    [savingAll, saveMany, reportSaveError]
  );

  /** Ekranda yuklu olan sonuclar. */
  const saveAllVisible = useCallback(
    (listId: string | null) => runBulkSave(async () => places, listId),
    [runBulkSave, places]
  );

  /**
   * Ilcenin filtreye uyan TUM sonuclari - yuklenmemis sayfalar dahil.
   *
   * Eskiden yalnizca ekrandaki 250 kaydedilebiliyordu; gerisi icin once
   * "daha fazla yukle" ile hepsini acmak gerekiyordu. Kalan sayfalar
   * ayni sorgu ve siralamayla cekiliyor ama listeye basilmiyor: binlerce
   * satiri DOM'a koymak tarayiciyi kilitliyordu (bkz. loadMore).
   */
  const saveAllResults = useCallback(
    (listId: string | null) =>
      runBulkSave(async () => {
        if (!district) return places;
        const all = [...places];
        const seen = new Set(all.map((p) => p.id));
        for (let offset = places.length; offset < total; offset += FETCH_ALL_PAGE) {
          const response = await fetchDistrictPlaces(district.id, {
            ...query,
            limit: FETCH_ALL_PAGE,
            offset,
          });
          if (response.results.length === 0) break;
          for (const place of response.results.map(districtPlaceToPlace)) {
            if (!seen.has(place.id)) {
              seen.add(place.id);
              all.push(place);
            }
          }
        }
        return all;
      }, listId),
    [runBulkSave, district, places, total, query]
  );

  /**
   * Toplu kayit butonlari once hedefi soruyor (SaveTargetModal). Yeni
   * liste secildiyse kayittan once olusturuluyor.
   */
  const [pendingSave, setPendingSave] = useState<{
    scope: "visible" | "all";
    count: number;
  } | null>(null);

  const confirmSaveTarget = useCallback(
    async (target: SaveTarget) => {
      const scope = pendingSave?.scope;
      setPendingSave(null);
      let listId: string | null = null;
      if (target.kind === "list") listId = target.listId;
      if (target.kind === "new") {
        try {
          listId = (await createList(target.name)).id;
          rememberList(listId);
        } catch (err: any) {
          reportSaveError(err, "Liste oluşturulamadı.");
          return;
        }
      }
      if (scope === "all") await saveAllResults(listId);
      else await saveAllVisible(listId);
    },
    [pendingSave, saveAllResults, saveAllVisible, reportSaveError]
  );

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

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      const chosen = places.filter((p) => savedIds.has(p.id));
      if (chosen.length === 0 || exporting) return;

      setExporting(true);
      setNotice(null);
      try {
        // PDF/Excel basligi: "Kadıköy · Otel". Tek tur secili degilse genel ad.
        const types = district ? query.types ?? [] : category ? [category] : [];
        const scope = district ? district.name : "Harita alanı";
        const what = types.length === 1 ? PLACE_TYPE_LABELS[types[0]] : "Kayıtlı yerler";
        const blob = await exportLeads(chosen, {
          type: category ?? chosen[0]?.type ?? "kayitli",
          radius: 0,
          center: bbox
            ? { lat: (bbox[1] + bbox[3]) / 2, lon: (bbox[0] + bbox[2]) / 2 }
            : undefined,
          format,
          title: `${scope} · ${what}`,
        });
        downloadBlob(blob, `leads_${category ?? "kayitli"}`, format);
        reloadAccount();
      } catch (err) {
        handleApiError(err);
      } finally {
        setExporting(false);
      }
    },
    [places, savedIds, category, bbox, exporting, handleApiError, reloadAccount, district, query.types]
  );

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

  // Sabit referans: MapView memo'lu ve her yeni dizi onu bosuna yeniden cizerdi.
  const mapCenter = useMemo<[number, number]>(
    () => (district ? [district.center[0], district.center[1]] : [41.0082, 28.9784]),
    [district]
  );

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
                  checkedIds={checkedIds}
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
            onSaveAll={() => setPendingSave({ scope: "visible", count: places.length })}
            // Yalnizca yuklenmemis sonuc varken: aksi halde iki buton ayni isi yapar.
            onSaveAllResults={
              district && total > places.length
                ? () => setPendingSave({ scope: "all", count: total })
                : undefined
            }
            allResultsCount={total}
            saveProgress={saveProgress}
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

      <SaveTargetModal
        isOpen={pendingSave !== null}
        count={pendingSave?.count ?? 0}
        onClose={() => setPendingSave(null)}
        onConfirm={confirmSaveTarget}
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
