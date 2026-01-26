"use client";

import { useState, useEffect, useRef } from "react";
import { Search, Locate, RotateCcw, ShieldCheck, ShieldAlert, RefreshCw, Zap, Crown } from "lucide-react";
import type { PlaceType, SearchParams } from "@/lib/types";
import type { PresetsResponse, ConfigStatus } from "@/lib/configTypes";
import TypeSelector from "./TypeSelector";

interface SearchControlsProps {
  onSearch: (params: Omit<SearchParams, "lat" | "lng"> & { lat?: number; lng?: number }) => void;
  isLoading: boolean;
  onLocationFound: (lat: number, lng: number) => void;
  autoSearch: boolean;
  onAutoSearchChange: (enabled: boolean) => void;
  presets: PresetsResponse;
  configStatus: ConfigStatus;
  onRefreshPresets: () => void;
  showHighConfidence: boolean;
  onHighConfidenceChange: (val: boolean) => void;
  onUpgradeTrigger: () => void;
  isPro: boolean;
}

export default function SearchControls({
  onSearch,
  isLoading,
  onLocationFound,
  autoSearch,
  onAutoSearchChange,
  presets,
  configStatus,
  onRefreshPresets,
  showHighConfidence,
  onHighConfidenceChange,
  onUpgradeTrigger,
  isPro,
}: SearchControlsProps) {
  const [selectedType, setSelectedType] = useState<PlaceType>("kindergarten");
  const [selectedRadius, setSelectedRadius] = useState(presets.default_by_type["kindergarten"] || 1000);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  
  const isManualRadiusRef = useRef(false);

  useEffect(() => {
    if (!isManualRadiusRef.current) {
      const rec = presets.default_by_type[selectedType];
      if (rec) setSelectedRadius(rec);
    }
  }, [selectedType, presets]);

  useEffect(() => {
    if (configStatus === "ready" && !isManualRadiusRef.current) {
      const rec = presets.default_by_type[selectedType];
      if (rec) setSelectedRadius(rec);
    }
  }, [configStatus]);

  useEffect(() => {
    if (autoSearch) {
      onSearch({
        type: selectedType,
        radius: selectedRadius,
      });
    }
  }, [selectedType, selectedRadius, autoSearch, onSearch]);

  const handleTypeChange = (newType: PlaceType) => {
    isManualRadiusRef.current = false;
    setSelectedType(newType);
  };

  const handleRadiusChange = (newRadius: number) => {
    isManualRadiusRef.current = true;
    setSelectedRadius(newRadius);
  };

  const handleResetRadius = () => {
    isManualRadiusRef.current = false;
    const rec = presets.default_by_type[selectedType];
    if (rec) setSelectedRadius(rec);
  };

  const handleUseMyLocation = () => {
    setLocationError(null);
    setIsGettingLocation(true);

    if (!navigator.geolocation) {
      setLocationError("Tarayıcınız konum servislerini desteklemiyor");
      setIsGettingLocation(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        onLocationFound(lat, lng);
        setIsGettingLocation(false);
      },
      (error) => {
        let message = "Konum alınamadı";
        if (error.code === error.PERMISSION_DENIED) {
          message = "Konum izni reddedildi. Varsayılan konum kullanılıyor.";
        }
        setLocationError(message);
        setIsGettingLocation(false);
      }
    );
  };

  const handleSearch = () => {
    onSearch({
      type: selectedType,
      radius: selectedRadius,
    });
  };

  const recommendedRadius = presets.default_by_type[selectedType] || 0;
  const isUsingRecommendation = selectedRadius === recommendedRadius;

  return (
    <div className="flex flex-col gap-6">
      <div className="w-full lg:w-80 bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6 space-y-6 text-left border border-slate-100 dark:border-slate-700 transition-all hover:shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-heading font-bold text-slate-900 dark:text-white mb-1 leading-tight">
              Arama
            </h2>
            <p className="text-[10px] text-slate-500 font-body uppercase tracking-wider font-bold">
              Konum ve Filtreler
            </p>
          </div>
        </div>

        {/* Searchable Type Selector */}
        <TypeSelector
          selectedType={selectedType}
          onTypeChange={handleTypeChange}
          presets={presets}
        />

        {/* Radius Selector */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label
              htmlFor="radius"
              className="block text-sm font-heading font-semibold text-slate-700 dark:text-slate-300"
            >
              Yarıçap
            </label>
            {!isUsingRecommendation && (
              <button
                onClick={handleResetRadius}
                className="flex items-center gap-1 text-[10px] font-bold text-primary hover:text-primary-600 transition-colors"
              >
                <RotateCcw className="w-2.5 h-2.5" />
                Sıfırla
              </button>
            )}
          </div>
          <select
            id="radius"
            value={selectedRadius}
            onChange={(e) => handleRadiusChange(Number(e.target.value))}
            className="w-full px-4 py-3 rounded-lg border-2 border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-900 dark:text-white font-body focus:outline-none focus:border-primary transition-colors cursor-pointer"
          >
            {presets.radius_options.map((option) => (
              <option key={option} value={option}>
                {option >= 1000 ? `${option/1000} km` : `${option} m`}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-[10px] text-slate-400 font-medium">
            Önerilen: <span className="text-slate-500 font-bold">{recommendedRadius} m</span>
          </p>
        </div>

        {/* Use My Location Button */}
        <button
          onClick={handleUseMyLocation}
          disabled={isGettingLocation}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-primary text-primary font-heading font-semibold hover:bg-primary hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Locate className="w-5 h-5" />
          {isGettingLocation ? "Konum alınıyor..." : "Konumumu Kullan"}
        </button>

        {locationError && (
          <div className="text-sm text-amber-600 dark:text-amber-400 font-body bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg">
            {locationError}
          </div>
        )}

        {/* Advanced Filters */}
        <div className="space-y-4 pt-4 border-t border-slate-50 dark:border-slate-800">
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Seçenekler</h4>
          
          <div className="grid grid-cols-1 gap-2">
            {/* High Confidence Toggle */}
            <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl group transition-all hover:bg-slate-100 dark:hover:bg-slate-900 border border-transparent hover:border-slate-200 dark:hover:border-slate-800">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${showHighConfidence ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400" : "bg-white dark:bg-slate-800 text-slate-400 shadow-sm"} transition-all`}>
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5 leading-none">
                    Güvenli Filtre
                    {!isPro && <Crown className="w-3 h-3 text-amber-500 fill-amber-500" />}
                  </p>
                  <p className="text-[9px] text-slate-500 font-bold uppercase tracking-tighter mt-1">Sadece Doğrulanmış</p>
                </div>
              </div>
              <button
                onClick={() => {
                  if (!isPro) {
                    onUpgradeTrigger();
                    return;
                  }
                  onHighConfidenceChange(!showHighConfidence);
                }}
                className={`relative inline-flex items-center h-5 w-9 rounded-full transition-all ${
                  showHighConfidence ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-700"
                }`}
              >
                <span
                  className={`inline-block w-3 h-3 transform bg-white rounded-full transition-transform ${
                    showHighConfidence ? "translate-x-5" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            {/* Auto Search Toggle */}
            <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl group transition-all hover:bg-slate-100 dark:hover:bg-slate-900 border border-transparent hover:border-slate-200 dark:hover:border-slate-800">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${autoSearch ? "bg-primary/10 text-primary" : "bg-white dark:bg-slate-800 text-slate-400 shadow-sm"} transition-all`}>
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900 dark:text-white leading-none">Otomatik Arama</p>
                  <p className="text-[9px] text-slate-500 font-bold uppercase tracking-tighter mt-1">Canlı Güncelleme</p>
                </div>
              </div>
              <button
                onClick={() => onAutoSearchChange(!autoSearch)}
                className={`relative inline-flex items-center h-5 w-9 rounded-full transition-all ${
                  autoSearch ? "bg-primary" : "bg-slate-200 dark:bg-slate-700"
                }`}
              >
                <span
                  className={`inline-block w-3 h-3 transform bg-white rounded-full transition-transform ${
                    autoSearch ? "translate-x-5" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Search Button */}
        <button
          onClick={handleSearch}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-2 px-4 py-4 rounded-2xl bg-primary text-white font-heading font-black text-lg hover:bg-primary-600 transition-all shadow-lg shadow-primary/20 hover:shadow-primary/40 disabled:opacity-50 disabled:cursor-not-allowed group"
        >
          <Search className="w-6 h-6 group-hover:scale-110 transition-transform" />
          {isLoading ? "ARANIYOR..." : "ARA"}
        </button>
      </div>

      {/* Config Status Label & Refresh */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-100 dark:bg-slate-700/50 rounded-xl">
        <div className="flex items-center gap-2">
          {configStatus === "ready" ? (
            <>
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">Veriler taze.</span>
            </>
          ) : (
            <>
              <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                {configStatus === "loading" ? "Yükleniyor..." : "Limitli Mod"}
              </span>
            </>
          )}
        </div>
        
        <button
          onClick={onRefreshPresets}
          disabled={configStatus === "loading"}
          className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors disabled:opacity-50 group"
        >
          <RefreshCw className={`w-3 h-3 text-slate-400 group-hover:text-primary transition-colors ${configStatus === 'loading' ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </div>
  );
}
