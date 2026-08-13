"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import Filters from "../components/Filters";
import PlaceList from "../components/PlaceList";
import ExportToolbar from "../components/ExportToolbar";
import ReportModal from "../components/ReportModal";
import SettingsModal from "../components/SettingsModal";
import UpgradeModal from "../components/UpgradeModal";
import { searchPlaces, exportLeads, fetchAccount } from "../lib/api";
import type { AccountInfo } from "../lib/api";
import type { Place, PlaceType } from "../lib/types";
import { KeyRound, X } from "lucide-react";

// Client-side only map import
const MapView = dynamic(() => import("../components/MapView"), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-paper-3" />,
});

const PLAN_LABELS: Record<string, string> = {
  free: "Ücretsiz",
  pro: "Pro",
  enterprise: "Enterprise",
};

export default function Home() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [category, setCategory] = useState<PlaceType | null>(null);
  const [bbox, setBbox] = useState<[number, number, number, number] | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string>();
  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * Disa aktarim sepeti. Sadece id degil Place nesnesinin kendisi
   * tutuluyor: kullanici haritada gezinirken onceki sonuclar listeden
   * dusuyor, ama sepete aldiklari korunuyor ve export'a dahil oluyor.
   */
  const [basket, setBasket] = useState<Map<string, Place>>(new Map());
  const [reportTarget, setReportTarget] = useState<Place | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  /** Arama uzun surunce gosterilen bilgi; spinner tek basina yeterli degil. */
  const [slowSearch, setSlowSearch] = useState(false);
  /** Bu oturumda gecerli plan/kota; null ise durum okunamadi. */
  const [account, setAccount] = useState<AccountInfo | null>(null);

  const reloadAccount = useCallback(() => {
    fetchAccount().then(setAccount);
  }, []);

  useEffect(() => {
    reloadAccount();
  }, [reloadAccount]);

  /**
   * Export'un neden yapilamayacagini onceden belirle. Backend 'free'
   * planda 403, kota dolunca 429 donuyordu; kullanici bunu ancak butona
   * bastiktan sonra ogreniyordu.
   * Export 2 kota birimi harciyor, kontrol de ona gore.
   *
   * "API anahtari gerekli" kosulu kaldirildi: indirme artik tipki arama
   * gibi sunucunun anahtarina geri dusuyor, dolayisiyla kisisel anahtar
   * bir on kosul degil. Burada kalan tek engel gercek olanlar - plan ve
   * kota.
   */
  const exportBlockedReason = (() => {
    if (!account) {
      return "Hesap durumu okunamadı; dışa aktarım şu an kullanılamıyor.";
    }
    if (!account.is_active) return "Kullanılan API anahtarı devre dışı.";
    if (account.plan === "free") {
      return "CSV dışa aktarım ücretsiz planda kapalı.";
    }
    if (account.daily_limit - account.used_today < 2) {
      return "Günlük kota dışa aktarım için yetersiz (2 birim gerekir).";
    }
    return null;
  })();

  const toggleBasket = useCallback((place: Place) => {
    setBasket((prev) => {
      const next = new Map(prev);
      if (next.has(place.id)) next.delete(place.id);
      else next.set(place.id, place);
      return next;
    });
  }, []);

  const selectAllVisible = useCallback(() => {
    setBasket((prev) => {
      const next = new Map(prev);
      places.forEach((p) => next.set(p.id, p));
      return next;
    });
  }, [places]);

  const clearBasket = useCallback(() => setBasket(new Map()), []);

  /**
   * Hata yonlendirmesi: api.ts 429'da "QUOTA_EXCEEDED" firlatiyor,
   * anahtar yoksa/gecersizse backend 401 donuyor. Ikisi de kullaniciyi
   * dogru modala goturmeli, yoksa buton sessizce bir sey yapmiyor gibi olur.
   */
  const handleApiError = useCallback((err: any) => {
    const message = String(err?.message ?? "");
    if (message === "QUOTA_EXCEEDED") {
      setUpgradeOpen(true);
      return;
    }
    if (err?.name === "TimeoutError") {
      setNotice("İşlem zaman aşımına uğradı. Lütfen tekrar deneyin.");
      return;
    }
    // Backend 'free' planda 403 donuyor; bu tam olarak UpgradeModal'in konusu.
    if (/plan|upgrade|disabled for/i.test(message)) {
      setUpgradeOpen(true);
      return;
    }
    if (/API-KEY|api key|401|yetki/i.test(message)) {
      setNotice("Bu işlem için API anahtarı gerekli.");
      setSettingsOpen(true);
      return;
    }
    setNotice(message || "İşlem başarısız oldu.");
  }, []);

  const handleExport = useCallback(async () => {
    // Cift tiklamada iki export istegi gitmesin (her biri 2 kota harciyor).
    if (basket.size === 0 || !category || exporting) return;

    setExporting(true);
    setNotice(null);
    try {
      const blob = await exportLeads(Array.from(basket.values()), {
        type: category,
        radius: 0,
        center: bbox
          ? { lat: (bbox[1] + bbox[3]) / 2, lon: (bbox[0] + bbox[2]) / 2 }
          : undefined,
      });

      // Blob'u indirilebilir dosyaya cevir ve objectURL'i geri birak.
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `leads_${category}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      // Export 2 birim harcadi; kalan kota gostergesi guncellensin.
      reloadAccount();
    } catch (err) {
      handleApiError(err);
    } finally {
      setExporting(false);
    }
  }, [basket, category, bbox, exporting, handleApiError, reloadAccount]);

  const performSearch = useCallback(async () => {
    if (!category || !bbox) {
      setPlaces([]);
      return;
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    // Bu cagriya ait controller yerelde tutuluyor: iptal edilen eski bir
    // cagri, kendisinden sonra baslayan aramanin state'ini ezmemeli.
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

      // Harita sinirdan genisse kullanici neyin tarandigini bilmeli,
      // yoksa eksik sonuclari "hic yok" sanir.
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
      // AbortError kullanicinin yeni aramasi demek, hata degil.
      // TimeoutError ayri bir tip: sessizce yutulmamali.
      if (err?.name === "AbortError" || !isCurrent()) return;

      // Onceden bu hata yalnizca console'a yaziliyordu; kullanici
      // 502/429 aldiginda "Sonuc bulunamadi" gorup veri yok saniyordu.
      setPlaces([]);
      if (err?.message === "QUOTA_EXCEEDED") {
        setUpgradeOpen(true);
      } else if (err?.name === "TimeoutError") {
        setNotice(
          "Arama zaman aşımına uğradı. Harita servisi şu an yavaş; " +
            "daha dar bir alana yakınlaşıp tekrar deneyin."
        );
      } else {
        setNotice(err?.message || "Arama başarısız oldu.");
      }
    } finally {
      // catch icindeki `return` bile finally'yi calistirir. Guard olmadan
      // iptal edilen eski cagri, devam eden yeni aramanin spinner'ini
      // kapatiyor ve arayuz bosta gorunuyordu.
      if (isCurrent()) setLoading(false);
    }
  }, [category, bbox]);

  // Aramalar soguk cache'te 1 dakikayi asabiliyor. 12 sn sonra kullaniciya
  // isin surdugunu soyluyoruz, yoksa arayuz donmus gibi gorunuyor.
  useEffect(() => {
    if (!loading) {
      setSlowSearch(false);
      return;
    }
    const timer = setTimeout(() => setSlowSearch(true), 12_000);
    return () => clearTimeout(timer);
  }, [loading]);

  // Debounce search on bbox/category change
  useEffect(() => {
    const timer = setTimeout(() => {
      performSearch();
    }, 500);

    return () => clearTimeout(timer);
  }, [performSearch]);

  const planLabel = account ? PLAN_LABELS[account.plan] ?? account.plan : null;
  const quotaRemaining = account
    ? Math.max(0, account.daily_limit - account.used_today)
    : null;

  return (
    <main className="flex flex-col h-screen bg-paper text-ink-2">
      {/*
        Flush bordered app bar - kenardan ayrilmis yuzen bir cubuk degil.
        Uygulama kabugu enstruman paneli gibi davranmali: tek hairline,
        golge yok.
      */}
      <header className="shrink-0 rule-b bg-paper">
        <div className="flex h-14 items-center gap-3 px-4">
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="font-display text-sm font-semibold tracking-tight text-ink">
              POI Finder
            </span>
            <span className="mono-label hidden sm:inline">Lead araması</span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {/* Plan durumu artik gercek: /api/me efektif kimligi
                raporluyor. Onceden burada yalnizca statik bir surum
                rozeti vardi ve kullanici hangi planla calistigini
                arayuzden hic goremiyordu. */}
            {account && (
              <span className="hidden sm:inline-flex items-center gap-2 rounded-input border border-rule px-2.5 py-1.5">
                <span className="mono-label text-ink-2">{planLabel}</span>
                {quotaRemaining !== null && (
                  <span className="mono-label tabular text-ink-4">
                    {quotaRemaining}
                  </span>
                )}
              </span>
            )}

            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="btn btn--ghost px-2.5 py-1.5"
            >
              <KeyRound size={13} />
              <span className="hidden sm:inline">Anahtar</span>
            </button>
          </div>
        </div>
      </header>

      {notice && (
        <div className="shrink-0 rule-b bg-caution-bg">
          <div className="flex items-start gap-3 px-4 py-2">
            <p className="text-xs text-caution leading-relaxed">{notice}</p>
            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label="Bildirimi kapat"
              className="ml-auto shrink-0 text-caution hover:text-ink transition-colors duration-fast ease-out"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {slowSearch && loading && (
        <div className="shrink-0 rule-b bg-paper-2">
          <div className="flex items-center gap-2.5 px-4 py-2">
            <span aria-hidden="true" className="w-3 h-3 shrink-0 rounded-full border-2 border-rule border-t-accent animate-spin" />
            <p className="text-xs text-ink-3">
              Arama sürüyor. Harita servisi şu an yavaş; geniş alanlarda bu bir
              dakikayı aşabilir.
            </p>
          </div>
        </div>
      )}

      {/*
        Map / Diagram: harita sayfayi orgutluyor, kenar cubugu onun
        lejanti. Mobilde kenar cubugu haritanin altina iniyor - dar
        ekranda once mekani gormek, sonra listeyi taramak dogru sira.
      */}
      <div className="flex flex-1 flex-col-reverse overflow-hidden lg:flex-row">
        {/* Not: `rule-r` bir Tailwind utility'si degil, globals.css'teki
            bilesen sinifi - `lg:` oneki ona uygulanmaz. Kirilim noktasina
            bagli kenarlik icin gercek utility'ler kullaniliyor. */}
        <aside className="flex w-full shrink-0 flex-col overflow-hidden bg-paper lg:w-[19rem] lg:border-r lg:border-rule">
          <Filters selectedCategory={category} onCategoryChange={setCategory} />

          <PlaceList
            places={places}
            loading={loading}
            selectedPlaceId={selectedPlaceId}
            onPlaceClick={setSelectedPlaceId}
            checkedIds={new Set(basket.keys())}
            onToggleCheck={toggleBasket}
            onReport={setReportTarget}
          />

          {/* Durum seridi: sayfanin footer'i bu. */}
          <div className="shrink-0 rule-t bg-paper-2 px-4 py-2.5 flex items-center justify-between">
            <span className="mono-label tabular">{places.length} sonuç</span>
            {basket.size > 0 && (
              <span className="mono-label tabular text-accent">
                {basket.size} seçili
              </span>
            )}
          </div>
        </aside>

        <div className="flex min-h-[45vh] flex-1 flex-col overflow-hidden lg:min-h-0">
          <div className="relative flex-1 overflow-hidden">
            <MapView
              places={places}
              center={[41.0082, 28.9784]} // İstanbul default
              zoom={12}
              onBoundsChange={setBbox}
              selectedPlaceId={selectedPlaceId}
            />
          </div>

          <ExportToolbar
            selectedCount={basket.size}
            totalResults={places.length}
            onSelectAll={selectAllVisible}
            onClearSelection={clearBasket}
            onExport={handleExport}
            exportBlockedReason={exportBlockedReason}
            quotaRemaining={quotaRemaining}
            isExporting={exporting}
          />
        </div>
      </div>

      {reportTarget && (
        <ReportModal
          // key: farkli bir yer secilince modal state'i (tur, not) sifirlansin
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
          // Yeni anahtarin plan/kota durumu hemen yansisin.
          reloadAccount();
        }}
      />

      <UpgradeModal isOpen={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
    </main>
  );
}
