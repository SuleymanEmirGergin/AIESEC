"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import Filters from "../components/Filters";
import PlaceList from "../components/PlaceList";
import ExportToolbar from "../components/ExportToolbar";
import ReportModal from "../components/ReportModal";
import SettingsModal from "../components/SettingsModal";
import UpgradeModal from "../components/UpgradeModal";
import { searchPlaces, exportLeads } from "../lib/api";
import type { Place, PlaceType } from "../lib/types";
import { Search, KeyRound } from "lucide-react";

// Client-side only map import
const MapView = dynamic(() => import("../components/MapView"), { 
  ssr: false,
  loading: () => <div className="w-full h-full bg-slate-100 animate-pulse rounded-2xl" />
});

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
    if (/API-KEY|api key|401|yetki/i.test(message)) {
      setNotice("Bu islem icin API anahtari gerekli.");
      setSettingsOpen(true);
      return;
    }
    setNotice(message || "Islem basarisiz oldu.");
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
    } catch (err) {
      handleApiError(err);
    } finally {
      setExporting(false);
    }
  }, [basket, category, bbox, exporting, handleApiError]);

  const performSearch = useCallback(async () => {
    if (!category || !bbox) {
      setPlaces([]);
      return;
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    try {
      const { places: results, meta } = await searchPlaces({
        bbox,
        category,
        limit: 250
      }, { signal: abortControllerRef.current.signal });

      setPlaces(results);

      // Harita sinirdan genisse kullanici neyin tarandigini bilmeli,
      // yoksa eksik sonuclari "hic yok" sanir.
      if (meta?.radiusClamped) {
        setNotice(
          `Harita cok genis. Merkez cevresinde ${Math.round(
            (meta.radiusUsed ?? 0) / 1000
          )} km taraniyor; daha fazlasi icin yakinlasin.`
        );
      } else {
        setNotice(null);
      }
    } catch (err: any) {
      // AbortError kullanicinin yeni aramasi demek, hata degil.
      if (err?.name === "AbortError") return;

      // Onceden bu hata yalnizca console'a yaziliyordu; kullanici
      // 502/429 aldiginda "Sonuc bulunamadi" gorup veri yok saniyordu.
      setPlaces([]);
      if (err?.message === "QUOTA_EXCEEDED") {
        setUpgradeOpen(true);
      } else {
        setNotice(err?.message || "Arama basarisiz oldu.");
      }
    } finally {
      setLoading(false);
    }
  }, [category, bbox]);

  // Debounce search on bbox/category change
  useEffect(() => {
    const timer = setTimeout(() => {
      performSearch();
    }, 500);

    return () => clearTimeout(timer);
  }, [performSearch]);

  return (
    <main className="flex flex-col h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Header */}
      <header className="h-16 px-6 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
            <Search size={18} className="text-white" />
          </div>
          <h1 className="font-bold text-xl tracking-tight">POI Finder</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-900 border border-slate-200 rounded-full px-3 py-1.5 transition-colors"
          >
            <KeyRound size={14} />
            API Anahtarı
          </button>
          <div className="text-xs text-slate-400 font-medium bg-slate-100 px-3 py-1.5 rounded-full uppercase tracking-widest">
            v2.0 Beta
          </div>
        </div>
      </header>

      {notice && (
        <div className="px-6 py-2 bg-amber-50 border-b border-amber-200 text-xs font-semibold text-amber-800 flex items-center justify-between">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="text-amber-600 hover:text-amber-900">
            kapat
          </button>
        </div>
      )}

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden p-4 gap-4">
        {/* Sidebar */}
        <div className="w-80 flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden shrink-0">
          <Filters 
            selectedCategory={category} 
            onCategoryChange={setCategory} 
          />
          <PlaceList
            places={places}
            loading={loading}
            selectedPlaceId={selectedPlaceId}
            onPlaceClick={setSelectedPlaceId}
            checkedIds={new Set(basket.keys())}
            onToggleCheck={toggleBasket}
            onReport={setReportTarget}
          />
          <div className="p-4 bg-slate-50 border-t border-slate-200 text-[10px] text-slate-400 font-medium flex justify-between">
            <span>{places.length} sonuç bulundu</span>
            {basket.size > 0 && <span>{basket.size} kayıt seçili</span>}
          </div>
        </div>

        {/* Map Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <ExportToolbar
            selectedCount={basket.size}
            totalResults={places.length}
            onSelectAll={selectAllVisible}
            onClearSelection={clearBasket}
            onExport={handleExport}
          />
          <div className="flex-1 overflow-hidden bg-white rounded-2xl shadow-sm border border-slate-200 p-1">
            <MapView
              places={places}
              center={[41.0082, 28.9784]} // İstanbul default
              zoom={12}
              onBoundsChange={setBbox}
              selectedPlaceId={selectedPlaceId}
            />
          </div>
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
            setNotice("Bildiriminiz alindi, tesekkurler.");
          }}
        />
      )}

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={() => {
          setSettingsOpen(false);
          setNotice(null);
        }}
      />

      <UpgradeModal isOpen={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
    </main>
  );
}
