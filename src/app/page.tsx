"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import Filters from "../components/Filters";
import PlaceList from "../components/PlaceList";
import { searchPlaces } from "../lib/api";
import type { Place, PlaceType } from "../lib/types";
import { Search } from "lucide-react";

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
      const results = await searchPlaces({
        bbox,
        category,
        limit: 250
      }, { signal: abortControllerRef.current.signal });
      
      setPlaces(results);
    } catch (err: any) {
      if (err.name !== "AbortError") {
        console.error("Search failed:", err);
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
        <div className="text-xs text-slate-400 font-medium bg-slate-100 px-3 py-1.5 rounded-full uppercase tracking-widest">
          v2.0 Beta
        </div>
      </header>

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
          />
          <div className="p-4 bg-slate-50 border-t border-slate-200 text-[10px] text-slate-400 font-medium">
            {places.length} sonuç bulundu
          </div>
        </div>

        {/* Map Area */}
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
    </main>
  );
}
