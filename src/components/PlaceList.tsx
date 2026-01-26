"use client";

import React from "react";
import { MapPin, Navigation } from "lucide-react";
import type { Place } from "../lib/types";

interface PlaceListProps {
  places: Place[];
  loading: boolean;
  onPlaceClick: (id: string) => void;
  selectedPlaceId?: string;
}

export default function PlaceList({ 
  places, 
  loading, 
  onPlaceClick, 
  selectedPlaceId 
}: PlaceListProps) {
  if (loading && places.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
          <p className="text-sm font-medium">Sonuçlar yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (places.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
        <MapPin size={48} className="mb-4 opacity-20" />
        <p className="text-sm">Sonuç bulunamadı. Lütfen haritayı kaydırın veya başka bir kategori seçin.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar">
      <div className="divide-y divide-slate-100">
        {places.map((place) => (
          <div
            key={place.id}
            onClick={() => onPlaceClick(place.id)}
            className={`
              p-4 cursor-pointer transition-all hover:bg-slate-50 group
              ${selectedPlaceId === place.id ? "bg-slate-50 border-l-4 border-slate-900" : "border-l-4 border-transparent"}
            `}
          >
            <div className="flex justify-between items-start mb-1">
              <h3 className="font-semibold text-slate-900 line-clamp-2 leading-tight group-hover:text-black">
                {place.name}
              </h3>
              <Navigation size={14} className="text-slate-300 group-hover:text-slate-900" />
            </div>
            <p className="text-xs text-slate-500 line-clamp-1 mb-2">
              {place.address}
            </p>
            <div className="flex gap-2">
              <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded uppercase font-bold">
                {place.type}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
