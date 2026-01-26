"use client";

import { useState, useMemo } from "react";
import type { Place } from "@/lib/types";
import { PLACE_TYPE_LABELS } from "@/lib/types";
import { formatDistance } from "@/lib/distance";
import { MapPin, Copy, AlertTriangle, Navigation, ArrowUpDown, CheckCircle2, Circle, Info, ShieldCheck, HelpCircle } from "lucide-react";
import ReportModal from "./ReportModal";
import ExportToolbar from "./ExportToolbar";

interface ResultsListProps {
  places: Place[];
  isLoading: boolean;
  onPlaceClick: (place: Place) => void;
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onExport: () => void;
}

type SortOption = "distance" | "name";

export default function ResultsList({
  places,
  isLoading,
  onPlaceClick,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onExport,
}: ResultsListProps) {
  const [reportingPlace, setReportingPlace] = useState<Place | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("distance");
  const [showConfidenceTooltip, setShowConfidenceTooltip] = useState<string | null>(null);

  const sortedPlaces = useMemo(() => {
    return [...places].sort((a, b) => {
      if (sortBy === "distance") {
        return (a.distance_m ?? 0) - (b.distance_m ?? 0);
      }
      return a.name.localeCompare(b.name, "tr");
    });
  }, [places, sortBy]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setToast("Koordinatlar kopyalandı");
    setTimeout(() => setToast(null), 3000);
  };

  const getConfidenceBadge = (score: number = 0.5) => {
    if (score >= 0.8) return { label: "Yüksek Güven", bg: "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400", dot: "bg-emerald-500" };
    if (score >= 0.5) return { label: "Orta Güven", bg: "bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400", dot: "bg-amber-500" };
    return { label: "Düşük Güven", bg: "bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400", dot: "bg-slate-400" };
  };

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent"></div>
        </div>
      </div>
    );
  }

  if (places.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6">
        <div className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
            <MapPin className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="font-heading font-bold text-lg text-slate-900 dark:text-white mb-2">
            Sonuç Bulunamadı
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 font-body">
            Seçilen kriterlere uygun yer bulunamadı.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        <ExportToolbar 
          selectedCount={selectedIds.length}
          totalResults={places.length}
          onSelectAll={onSelectAll}
          onClearSelection={onClearSelection}
          onExport={onExport}
        />

        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6 relative flex flex-col h-[calc(100vh-450px)] lg:h-[750px] border border-slate-100 dark:border-slate-800">
          {toast && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-4 py-2 rounded-full text-xs font-heading font-semibold shadow-xl animate-in fade-in slide-in-from-top-2">
              {toast}
            </div>
          )}

          <div className="flex items-center justify-between mb-6 shrink-0">
            <h3 className="font-heading font-bold text-xl text-slate-900 dark:text-white">
              Yerler ({places.length})
            </h3>
            
            <div className="flex items-center gap-2">
              <ArrowUpDown className="w-3 h-3 text-slate-400" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="text-[10px] font-heading font-bold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-md px-2 py-1 outline-none appearance-none cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
              >
                <option value="distance">En Yakın</option>
                <option value="name">A-Z</option>
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-4">
            {sortedPlaces.map((place) => {
              const isSelected = selectedIds.includes(place.id);
              const confidence = getConfidenceBadge(place.confidence_score);
              return (
                <div
                  key={place.id}
                  className={`group relative p-4 rounded-2xl border-2 transition-all duration-300 ${
                    isSelected 
                      ? "border-primary bg-primary/5 dark:bg-primary/10 shadow-lg ring-2 ring-primary/5" 
                      : "border-slate-50 dark:border-slate-800/50 hover:border-slate-100 dark:hover:border-slate-700 hover:bg-slate-50/50 dark:hover:bg-slate-700/30"
                  }`}
                >
                  <label className="absolute top-4 right-4 z-10 p-1 cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only" 
                      checked={isSelected}
                      onChange={() => onToggleSelect(place.id)}
                    />
                    {isSelected ? (
                      <CheckCircle2 className="w-5 h-5 text-primary fill-primary/10 animate-in zoom-in-50" />
                    ) : (
                      <Circle className="w-5 h-5 text-slate-200 dark:text-slate-700 group-hover:text-slate-300 transition-colors" />
                    )}
                  </label>

                  <div className="flex items-start justify-between gap-3 mb-2 pr-10">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-heading font-bold text-base text-slate-900 dark:text-white truncate">
                          {place.name}
                        </h4>
                        <div className="relative">
                          <button 
                            onMouseEnter={() => setShowConfidenceTooltip(place.id)}
                            onMouseLeave={() => setShowConfidenceTooltip(null)}
                            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold transition-all ${confidence.bg}`}
                          >
                            <div className={`w-1 h-1 rounded-full ${confidence.dot} animate-pulse`} />
                            {confidence.label}
                          </button>
                          {showConfidenceTooltip === place.id && (
                            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-48 p-3 bg-slate-900 text-white text-[9px] font-body rounded-xl shadow-2xl z-[100] animate-in fade-in slide-in-from-bottom-1 border border-white/10">
                              Bu veri OpenStreetMap kaynaklıdır. Güven skoru otomatik hesaplanır.
                              <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-slate-900" />
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] uppercase tracking-wider font-bold text-primary bg-primary/5 px-2 py-0.5 rounded">
                          {PLACE_TYPE_LABELS[place.type]}
                        </span>
                        {place.distance_m !== undefined && (
                          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                            {formatDistance(place.distance_m)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-slate-500 dark:text-slate-400 font-body mb-4 line-clamp-2 pr-4 leading-relaxed">
                    {place.address}
                  </p>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => onPlaceClick(place)}
                      className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-primary hover:text-primary text-[10px] font-heading font-bold transition-all shadow-sm"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                      Yol Tarifi
                    </button>
                    <button
                      onClick={() => copyToClipboard(`${place.coordinates.lat}, ${place.coordinates.lng}`)}
                      className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-primary hover:text-primary text-[10px] font-heading font-bold transition-all shadow-sm"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Kopyala
                    </button>
                    <button
                      onClick={() => setReportingPlace(place)}
                      className="col-span-2 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-900/10 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/20 text-[10px] font-heading font-bold transition-all mt-1 border border-amber-100 dark:border-amber-900/20"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Hatalı Veri Bildir
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {reportingPlace && (
        <ReportModal
          place={reportingPlace}
          isOpen={!!reportingPlace}
          onClose={() => setReportingPlace(null)}
          onSuccess={() => {
            setReportingPlace(null);
            setToast("Bildirimin alındı");
            setTimeout(() => setToast(null), 3000);
          }}
        />
      )}
    </>
  );
}
